export function chapterAt(chapters, time) {
  return Math.max(0, chapters.findLastIndex(chapter => time >= chapter.start));
}

// Media-independent state transitions allow deterministic boundary/race tests.
export class LessonController {
  constructor(media, lesson, update = () => {}) {
    this.media = media;
    this.lesson = lesson;
    this.update = update;
    this.mode = 'continuous';
    this.active = 0;
    this.bookmark = null;
    this.review = false;
    this.held = false;
    this.pending = null;
    this.request = 0;
    this.questionsEnabled = true;
    this.question = null;
    this.explanation = null;
    this.completedQuestions = new Set();
    this.lastTime = 0;
  }
  get duration() { return Number.isFinite(this.media.duration) ? this.media.duration : this.lesson.duration; }
  get end() { return Math.min(this.lesson.chapters[this.active].end, this.duration); }
  emit() { this.update(this); }
  async play() {
    const request = ++this.request;
    try { await this.media.play(); }
    catch (error) {
      if (request === this.request && error.name !== 'AbortError') {
        this.onPlayError?.('未能自動播放，請按影片的播放按鈕繼續。');
      }
    }
  }
  seek(time, playing) {
    ++this.request;
    this.media.pause();
    this.held = false;
    const target = Math.max(0, Math.min(time, this.duration));
    this.active = chapterAt(this.lesson.chapters, target);
    this.pending = target;
    this.media.currentTime = target;
    this.lastTime = target;
    if (playing) this.play();
    this.emit();
  }
  jump(index) {
    this.cancelQuestion();
    if (index !== this.active && !this.bookmark) {
      this.bookmark = {time: this.media.currentTime, playing: !this.media.paused};
    }
    this.review = false;
    this.seek(this.lesson.chapters[index].start, true);
  }
  replay() {
    this.cancelQuestion();
    this.review = true;
    this.seek(this.lesson.chapters[this.active].start, true);
  }
  next() {
    this.review = false;
    if (this.active + 1 < this.lesson.chapters.length) {
      this.seek(this.lesson.chapters[this.active + 1].start, true);
    }
  }
  goBack() {
    if (!this.bookmark) return;
    this.cancelQuestion();
    const {time, playing} = this.bookmark;
    this.bookmark = null;
    this.review = false;
    this.seek(time, playing);
  }
  setMode(mode) { this.mode = mode; this.review = false; this.emit(); }
  cancelQuestion() { this.question = null; this.explanation = null; }
  setQuestions(enabled) {
    this.questionsEnabled = enabled;
    if (!enabled && (this.question || this.explanation)) {
      const question = this.question || this.explanation;
      this.cancelQuestion();
      this.seek(question.item.at + 0.01, false);
    }
    this.emit();
  }
  ask(item, previous = null) {
    this.explanation = null;
    this.question = previous || {item, choice: null, correct: false, feedback: ''};
    this.seek(item.at, false);
  }
  answer(choice) {
    if (!this.question || this.question.correct) return;
    const q = this.question;
    q.choice = choice;
    q.correct = choice === q.item.answer;
    q.feedback = q.correct ? q.item.explanation : q.item.hints[choice];
    this.emit();
  }
  continueQuestion() {
    if (!this.question) return;
    const item = this.question.item;
    this.completedQuestions.add(item.id);
    this.cancelQuestion();
    this.seek(item.at + 0.01, true);
  }
  reviewExplanation() {
    if (!this.question) return;
    this.explanation = this.question;
    this.question = null;
    this.review = false;
    this.seek(this.explanation.item.reviewStart, true);
  }
  seeking() {
    // A scrub overrides review/end-hold; internal navigation retains review.
    if (this.pending === null || Math.abs(this.media.currentTime - this.pending) > 0.15) {
      this.pending = null;
      this.review = false;
      this.held = false;
      this.cancelQuestion();
      this.lastTime = this.media.currentTime;
    }
    this.active = chapterAt(this.lesson.chapters, this.media.currentTime);
    this.emit();
  }
  seeked() {
    if (this.pending !== null && Math.abs(this.media.currentTime - this.pending) < 0.15) this.pending = null;
    this.active = chapterAt(this.lesson.chapters, this.media.currentTime);
    this.emit();
  }
  onPlay() {
    if (this.question) { this.media.pause(); return; }
    // Native play at a held boundary means continue, never immediately stop again.
    if (this.held) {
      if (this.active + 1 < this.lesson.chapters.length) this.next();
      else this.seek(0, true);
    }
  }
  tick() {
    if (this.media.seeking || this.pending !== null || this.held) return;
    if (this.question) { if (!this.media.paused) this.media.pause(); return; }
    if (this.explanation) {
      if (!this.media.paused && this.media.currentTime >= this.explanation.item.reviewEnd - 0.06) {
        const previous = this.explanation;
        this.ask(previous.item, previous);
      }
      return;
    }
    const time = this.media.currentTime;
    const question = (this.lesson.questions || []).find(q => this.questionsEnabled &&
      !this.completedQuestions.has(q.id) && this.lastTime <= q.at && time >= q.at);
    this.lastTime = time;
    if (!this.media.paused && question) { this.ask(question); return; }
    if (!this.media.paused && (this.review || this.mode === 'step') && this.media.currentTime >= this.end - 0.06) {
      this.hold();
      return;
    }
    const index = chapterAt(this.lesson.chapters, this.media.currentTime);
    if (index !== this.active) { this.active = index; this.emit(); }
  }
  hold() {
    this.media.pause();
    // Stay within this chapter. All non-final ends fall in subtitle-free gaps.
    const stop = Math.max(this.lesson.chapters[this.active].start, this.end - 0.06);
    this.pending = stop;
    this.media.currentTime = stop;
    this.held = true;
    this.emit();
  }
  ended() {
    this.active = this.lesson.chapters.length - 1;
    this.held = true;
    this.emit();
  }
}
