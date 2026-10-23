import {lesson} from './lesson.js';
import {LessonController} from './controller.js';
const $ = id => document.getElementById(id);
const video = $('video');
const format = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
const list = $('chapter-list');
let renderedQuestion = null;
let questionVisible = false;
const buttons = lesson.chapters.map((chapter, index) => {
  const button = document.createElement('button');
  button.className = 'chapter';
  button.disabled = true;
  const number = document.createElement('span');
  number.className = 'chapter-index';
  number.textContent = String(index + 1).padStart(2, '0');
  const text = document.createElement('span');
  const title = document.createElement('span');
  title.className = 'chapter-title';
  title.textContent = chapter.title;
  const time = document.createElement('span');
  time.className = 'chapter-time';
  const hasQuestion = lesson.questions.some(q => q.at >= chapter.start && q.at < chapter.end);
  time.textContent = format(chapter.start) + (hasQuestion ? ' · 含思考題' : '');
  text.append(title, time);
  button.append(number, text);
  button.addEventListener('click', () => controller.jump(index));
  list.append(button);
  return button;
});
function render(state) {
  const q = state.question;
  $('question-panel').hidden = !q;
  $('explanation-panel').hidden = !state.explanation;
  if (state.explanation) $('explanation-message').textContent = `正在重看：${state.explanation.item.reviewTitle}。看完會自動返回問題。`;
  $('questions-enabled').checked = state.questionsEnabled;
  if (q) {
    $('question-title').textContent = q.item.prompt;
    if (renderedQuestion !== q.item.id) {
      $('question-options').replaceChildren(...q.item.options.map((text, index) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.addEventListener('click', () => controller.answer(index));
        return button;
      }));
      renderedQuestion = q.item.id;
    }
    [...$('question-options').children].forEach((button, index) => {
      button.setAttribute('aria-pressed', String(q.choice === index));
      button.disabled = q.correct;
    });
    $('question-feedback').textContent = q.feedback;
    $('question-feedback').className = q.feedback && !q.correct ? 'wrong' : '';
    $('question-continue').hidden = !q.correct;
    $('question-skip').hidden = q.correct;
    if (!questionVisible) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      $('question-title').focus({preventScroll: true});
      $('question-panel').scrollIntoView({block: 'center'});
    }
  }
  questionVisible = Boolean(q);
  buttons.forEach((button, index) => button.setAttribute('aria-current', String(index === state.active)));
  $('chapter-number').textContent = `第 ${state.active + 1} / ${lesson.chapters.length} 段`;
  $('current-title').textContent = lesson.chapters[state.active].title;
  $('continuous').setAttribute('aria-pressed', String(state.mode === 'continuous'));
  $('step').setAttribute('aria-pressed', String(state.mode === 'step'));
  $('mode-help').textContent = state.review ? '這次只重看本段，播完便停下。' : state.mode === 'step' ? '每段播完會停下來，準備好再繼續。' : '順着故事看下去，也可以隨時選一個問題跳看。';
  $('return').disabled = !state.bookmark;
  $('bookmark').textContent = state.bookmark ? `已留住 ${format(state.bookmark.time)} 的位置，跳看其他段落也不會覆蓋。` : '跳看其他段落後，可以回到這裏。';
  $('stop-panel').hidden = !state.held || Boolean(q || state.explanation);
  $('replay').disabled = Boolean(q || state.explanation);
  const last = state.active === lesson.chapters.length - 1;
  $('stop-message').textContent = last ? '全片看完了。還有哪一步想再看一次？' : '這一段看完了。想清楚了，再繼續。';
  $('next').hidden = last;
}
const controller = new LessonController(video, lesson, render);
controller.onPlayError = message => { $('status').textContent = message; };
render(controller);
$('questions-enabled').addEventListener('change', event => controller.setQuestions(event.target.checked));
$('question-review').addEventListener('click', () => {
  controller.reviewExplanation();
  video.scrollIntoView({block: 'start'});
});
$('question-continue').addEventListener('click', () => controller.continueQuestion());
$('question-skip').addEventListener('click', () => controller.continueQuestion());
$('back-question').addEventListener('click', () => {
  if (controller.explanation) controller.ask(controller.explanation.item, controller.explanation);
});
$('continuous').addEventListener('click', () => controller.setMode('continuous'));
$('step').addEventListener('click', () => controller.setMode('step'));
$('speed').addEventListener('change', event => { video.playbackRate = Number(event.target.value); });
$('replay').addEventListener('click', () => controller.replay());
$('again').addEventListener('click', () => controller.replay());
$('next').addEventListener('click', () => controller.next());
$('return').addEventListener('click', () => controller.goBack());
video.addEventListener('loadedmetadata', () => {
  $('controls').disabled = false;
  buttons.forEach(button => { button.disabled = false; });
  $('status').textContent = '準備好了，按影片的播放按鈕開始。';
});
video.addEventListener('error', () => {
  $('error').hidden = false;
  $('error').textContent = '影片未能載入。請確認本機服務已啟動、原影片仍在原來的位置，再重新整理頁面。';
  $('controls').disabled = true;
  buttons.forEach(button => { button.disabled = true; });
  $('status').textContent = '';
});
video.addEventListener('seeking', () => controller.seeking());
video.addEventListener('seeked', () => controller.seeked());
video.addEventListener('timeupdate', () => controller.tick());
video.addEventListener('ended', () => controller.ended());
let timer;
video.addEventListener('play', () => {
  controller.onPlay();
  clearInterval(timer);
  if (video.paused) return;
  timer = setInterval(() => controller.tick(), 20);
  $('status').textContent = '';
});
video.addEventListener('pause', () => clearInterval(timer));
// Do not let throttled background timers run past a learning boundary.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (controller.mode === 'step' || controller.review || controller.questionsEnabled || controller.explanation)) video.pause();
});
video.src = lesson.src;
