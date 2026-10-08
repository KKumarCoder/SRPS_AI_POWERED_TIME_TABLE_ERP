import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReferenceImport,parseHandwrittenLabel,teacherRows} from '../src/handwritten-reference.js';
import {summarize} from '../src/handwritten-import.js';

test('imports 24 teacher rows and exactly nine cells per row as one reference day',()=>{
 const {teacherOrder,slots}=buildReferenceImport([],[],[]);
 assert.equal(teacherRows.length,24);
 assert.equal(teacherOrder.length,24);
 assert.equal(slots.length,24*9);
 assert.ok(teacherRows.every(row=>row.cells.length===9));
 assert.ok(slots.every(slot=>slot.day==='REFERENCE_DAY'&&slot.weekdayVerified===false));
 assert.equal(new Set(teacherOrder.map(row=>row.sourceRowId)).size,24);
 assert.deepEqual(teacherOrder.filter(row=>row.displayName==='Ankit').map(row=>row.rowNumber),[6,17]);
 assert.deepEqual(teacherOrder.filter(row=>row.displayName==='Monika').map(row=>row.rowNumber),[7,24]);
});

test('preserves raw text and retains free, combined, confidence and source metadata',()=>{
 const {slots}=buildReferenceImport([],[],[]);
 const grouped=slots.find(slot=>slot.rawLabel.includes('(1-3)')&&slot.rawLabel.includes('/'));
 const free=slots.find(slot=>slot.rawLabel==='—');
 assert.equal(grouped.type,'COMBINED');
 assert.equal(grouped.source,'HANDWRITTEN_TIMETABLE_2026');
 assert.equal(grouped.sourceType,'HANDWRITTEN_REFERENCE_DAY');
 assert.equal(grouped.needsReview,true);
 assert.equal(grouped.assignments.length>0,true);
 assert.equal(free.type,'FREE');
 assert.equal(free.rawLabel,'—');
 assert.equal(summarize(slots).totalCells,216);
 assert.equal(summarize(slots).freeCells,22);
 assert.equal(summarize(slots).temporaryDummyCells,0);
});

test('parses common shorthand without replacing the preserved label',()=>{
 assert.deepEqual(parseHandwrittenLabel('10NC'),{
  classNumber:10,sectionCode:'NC',sectionType:'NON_COACHING',stream:null,subjectCode:null,groups:[]
 });
 assert.equal(parseHandwrittenLabel('12th Sci').stream,'SCIENCE');
 assert.equal(parseHandwrittenLabel('10C Eng').subjectCode,'ENG');
 assert.deepEqual(parseHandwrittenLabel('(1-3) 7C / (4-6) 7NC').groups,['1-3','4-6']);
});

test('only maps a teacher when the identity match is unique and exact',()=>{
 const teachers=[{_id:'one',name:'Sukhdeep',employeeId:'1003'},{_id:'two',name:'Monika',employeeId:'1021'}];
 const {teacherOrder}=buildReferenceImport(teachers,[],[]);
 assert.equal(teacherOrder.find(row=>row.displayName==='Sukhdeep').teacherId,'one');
 assert.equal(teacherOrder.find(row=>row.displayName==='Sukhdeep').matchStatus,'MATCHED');
 assert.equal(teacherOrder.filter(row=>row.displayName==='Monika').every(row=>row.matchStatus==='UNMATCHED'),true);
});
