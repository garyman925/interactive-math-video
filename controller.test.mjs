import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lesson} from './lesson.js';
import {LessonController} from './controller.js';
function setup() {
  const media = {currentTime: 0, duration: lesson.duration, paused: true, seeking: false, pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};
  const state = new LessonController(media,lesson);
  const settle = () => {state.seeking();state.seeked();};
  return {media,state,settle};
}
test('all ten chapter jumps and final duration',()=>{
  const {media,state,settle}=setup();
  lesson.chapters.forEach((chapter,index)=>{state.jump(index);settle();assert.equal(media.currentTime,chapter.start);assert.equal(state.active,index);assert.equal(media.paused,false);});
  assert.equal(state.end,lesson.duration);
});
test('step pauses before each boundary; native resume continues',()=>{
  const {media,state,settle}=setup();state.setQuestions(false);state.setMode('step');
  lesson.chapters.forEach((chapter,index)=>{
    state.jump(index);settle();media.currentTime=chapter.end-.04;state.tick();settle();
    assert.equal(media.paused,true);assert.equal(state.held,true);assert.equal(state.active,index);assert.ok(media.currentTime<chapter.end);
    state.onPlay();settle();assert.equal(state.active,index===9?0:index+1);
  });
});
test('continuous crosses chapter without pausing; review pauses once',()=>{
  const {media,state,settle}=setup();state.setQuestions(false);state.jump(0);settle();media.currentTime=70;state.tick();assert.equal(state.active,1);assert.equal(media.paused,false);
  state.replay();settle();media.currentTime=99.16;state.tick();assert.equal(state.held,true);assert.equal(media.paused,true);
  state.next();settle();assert.equal(state.review,false);media.currentTime=128;state.tick();assert.equal(media.paused,false);
});
for(const playing of [false,true]) test(`first bookmark survives rapid jumps, restores playing=${playing}`,()=>{
  const {media,state,settle}=setup();media.currentTime=23.5;media.paused=!playing;
  state.jump(2);state.jump(7);state.jump(4);settle();
  assert.equal(state.active,4);assert.deepEqual(state.bookmark,{time:23.5,playing});
  state.goBack();settle();assert.equal(media.currentTime,23.5);assert.equal(media.paused,!playing);assert.equal(state.bookmark,null);
});
test('manual scrub overrides a review stop and synchronizes the active chapter',()=>{
  const {media,state,settle}=setup();state.replay();settle();media.currentTime=210;state.seeking();state.seeked();state.tick();assert.equal(state.active,5);assert.equal(state.review,false);assert.equal(media.paused,false);
});
test('a held end stays held after seek events, and replay works',()=>{
  const {media,state,settle}=setup();state.setMode('step');state.jump(9);settle();media.currentTime=lesson.duration-.03;state.tick();settle();state.tick();assert.equal(state.held,true);assert.equal(state.active,9);
  state.replay();settle();assert.equal(state.held,false);assert.equal(media.currentTime,287.4);
});
test('chapter starts and stop points do not intersect subtitle dialogue',()=>{
  const srt=readFileSync(new URL('./fixtures/English_Subtitles.srt',import.meta.url),'utf8');
  const seconds=text=>{const [h,m,s]=text.replace(',','.').split(':').map(Number);return h*3600+m*60+s;};
  const cues=[...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g)].map(m=>[seconds(m[1]),seconds(m[2])]);
  for(const chapter of lesson.chapters) for(const time of [chapter.start,chapter.end-.06]) assert.ok(!cues.some(([start,end])=>time>start&&time<end),`boundary ${time} overlaps speech`);
});
for(const mode of ['continuous','step']) test(`question pauses before answer in ${mode} mode`,()=>{
  const {media,state,settle}=setup();state.setMode(mode);state.jump(6);settle();
  media.currentTime=236.72;state.tick();settle();
  assert.equal(media.currentTime,236.7);assert.equal(media.paused,true);assert.ok(state.question);assert.equal(state.held,false);
  media.play();state.onPlay();assert.equal(media.paused,true);
  state.answer(0);assert.equal(state.question.correct,false);assert.match(state.question.feedback,/一邊/);
  state.answer(2);assert.match(state.question.feedback,/抵消/);
  state.answer(1);assert.equal(state.question.correct,true);assert.equal(media.paused,true);
  state.continueQuestion();settle();state.tick();assert.equal(state.question,null);assert.equal(media.paused,false);
});
test('explanation clip returns to same question and preserves navigation bookmark',()=>{
  const {media,state,settle}=setup();media.currentTime=12;state.jump(6);settle();media.currentTime=236.71;state.tick();settle();
  state.answer(0);const bookmark=state.bookmark;state.reviewExplanation();settle();assert.equal(media.currentTime,67.3);assert.equal(state.question,null);
  media.currentTime=82.95;state.tick();settle();assert.equal(media.currentTime,236.7);assert.equal(media.paused,true);assert.equal(state.question.choice,0);assert.equal(state.bookmark,bookmark);
});
test('toggle, skip, manual scrub and chapter jump do not leave a stuck question',()=>{
  const {media,state,settle}=setup();state.jump(6);settle();media.currentTime=236.71;state.tick();settle();state.setQuestions(false);settle();assert.equal(state.question,null);
  state.setQuestions(true);state.jump(6);settle();media.currentTime=236.71;state.tick();settle();state.continueQuestion();settle();state.tick();assert.equal(state.question,null);
  state.completedQuestions.clear();state.jump(6);settle();media.currentTime=236.71;state.tick();settle();media.currentTime=260;state.seeking();state.seeked();assert.equal(state.question,null);assert.equal(state.active,7);
  state.jump(6);settle();media.currentTime=236.71;state.tick();settle();state.reviewExplanation();settle();state.jump(3);settle();assert.equal(state.explanation,null);assert.equal(state.active,3);
});
test('question and explanation bounds fall in subtitle gaps, before spoken answer',()=>{
  const srt=readFileSync(new URL('./fixtures/English_Subtitles.srt',import.meta.url),'utf8');
  const seconds=text=>{const [h,m,s]=text.replace(',','.').split(':').map(Number);return h*3600+m*60+s;};
  const cues=[...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g)].map(m=>[seconds(m[1]),seconds(m[2])]);
  for(const q of lesson.questions){for(const t of [q.at,q.reviewStart,q.reviewEnd-.06])assert.ok(!cues.some(([s,e])=>t>s&&t<e),`${q.id}: ${t} overlaps dialogue`);}
  const original = lesson.questions.find(q=>q.id==='isolate-x');assert.ok(original.at>236.4&&original.at<238.2);
});
for(const item of lesson.questions) for(const mode of ['continuous','step']) test(`${item.id}: ${mode}, hints, review return and completion`,()=>{
  const {media,state,settle}=setup();state.setMode(mode);
  const index=lesson.chapters.findIndex(c=>item.at>=c.start&&item.at<c.end);
  state.jump(index);settle();media.currentTime=item.at+.01;state.tick();settle();
  assert.equal(state.question.item.id,item.id);assert.equal(media.paused,true);
  for(let choice=0;choice<item.options.length;choice++)if(choice!==item.answer){state.answer(choice);assert.equal(state.question.correct,false);assert.ok(state.question.feedback.length>10);}
  state.reviewExplanation();settle();assert.equal(media.currentTime,item.reviewStart);
  media.currentTime=item.reviewEnd-.04;state.tick();settle();assert.equal(state.question.item.id,item.id);assert.equal(media.currentTime,item.at);assert.equal(media.paused,true);
  state.answer(item.answer);assert.equal(state.question.correct,true);state.continueQuestion();settle();state.tick();assert.equal(state.question,null);assert.equal(media.paused,false);
});
test('completed questions do not suppress later concepts or recur inside explanation clips',()=>{
  const {media,state,settle}=setup();state.jump(0);settle();
  for(const item of lesson.questions){media.currentTime=item.at+.01;state.tick();settle();assert.equal(state.question.item.id,item.id);state.continueQuestion();settle();}
  assert.equal(state.completedQuestions.size,4);
  state.jump(1);settle();media.currentTime=83;state.tick();assert.equal(state.question,null);
});
