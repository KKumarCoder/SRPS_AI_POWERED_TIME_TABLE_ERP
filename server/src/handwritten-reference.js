export const sourceType='HANDWRITTEN_REFERENCE_DAY';
export const sourceName='Original Handwritten Timetable - Reference Day';

const rawRows=[
 ['Manju Sangwan',['—','12th Arts','10C S.St','10C Eng','—','10NC','9C S.St','12 Arts Eng','—']],
 ['Sandeep Kr. / Sandeep Kumar',['—','—','9C (1-3) / 9NC (4-6)','10NC S.St','12th NC','(1-3) Free / (4-6) NC','(1-3) Free / (4-6) NC','(1-3) 8C / (4-6) Free','11th']],
 ['Krishna',['12th Eco.','(4-6) 7C / (1-3) 4M','(1-3) 4M / (4-6) 8C','9NC (1-3)','(1-3) 7NC / (4-6) 7NC','(1-3) Free / (4-6) 8NC','(1-3) 6C / (4-6) 6C','(1-3) 8C / (4-6) 8C','11th (1-3) 7C / (4-6) 6C']],
 ['Rishan',['—','—','12th Arts','8NC','(1-3) 6NC / (4-6) 6C','9NC (1-3)','(1-3) 9C / (4-6) 9C','10C','12th Arts']],
 ['Vipin',['11th Com.','10NC','12th Com','12th Com','—','11th Com','11th Com','12th Com','12th Com']],
 ['Ankit',['12th Sci','12th Sci','—','7C','10NC','11th Sci','11th Sci','9C','10C']],
 ['Monika',['11th Sci','11th Sci','12th Sci','12th Sci','9C','10C','10NC','9NC','(1-3) 7C / (4-6) —']],
 ['Yogesh',['10th C','10C','11th Sci','11th Sci','—','12th Sci','12th Sci','11th Sci','12th Sci']],
 ['Jaishree',['10th NC','9NC','11th Sci','11th Sci','10C','12th Sci','12th Sci','(1-3) — / (4-6) 6C','9C']],
 ['Virender',['9th C','9C','7C','4-6 9NC','9NC','8C','8C','10NC','10NC (1-3) / (4-6) 8C']],
 ['Kuldeep',['9th NC','6NC','6NC','9C','11th','(1-3) 6NC / (4-6) 6C','11/12 Arts','—','12th Arts']],
 ['Sonu',['8th C + GK','8NC','10NC','10NC Phy. Edu.','—','(1-3) 7NC / (4-6) 7NC','9NC','(1-3) 7C / (4-6) 7NC Eng','(1-3) 8C Eng / (4-6) 8NC']],
 ['Kashmir',['8th NC','8C','10NC','5M','(1-3) 5M / (4-6) 6NC GK','(1-3) 6NC / (4-6) 6C','7C','5V','(1-3) 8NC GK / (4-6) —']],
 ['Shivani',['7th C','7NC','—','6C','7C','11/12th','6NC','11/12th','11th Phy Edu.']],
 ['Parveen',['7th NC','7C','6C','6NC','12th','—','7NC + 2 days','8NC + 6C (4-6)','6NC + 6C (4-6) SKT']],
 ['Nikita',['6th C','6NC','7C','—','8NC','(1-3) 7NC / (4-6) 7NC','6C','(1-3) 7NC / (4-6) 6NC','7NC']],
 ['Ankit',['6th NC','—','7NC','8C','6C','9NC','8NC','6C','(1-3) 7C / (4-6) 10NC']],
 ['Arti',['5th M','3J','—','4M','5V','3V','3V','3M','5M']],
 ['Sumay',['5th V','—','4M Eng','5M Math','3M Eng','3J','4V','3V','5V']],
 ['Arya',['4th M','5V','3J','4M','3J (4-6)','3V','3M','5M','4M']],
 ['Sukhdeep',['4th V','—','3M','3V','4M','5M (1-3)','5M (4-6)','3J','4V']],
 ['Seema',['3rd M','5M','3V','3J','—','—','5V','—','3M']],
 ['Kusum',['3rd V','3M Eng','4V Eng','3M (4-6)','4V Comp','4M Comp','3J Eng','4M Eng','3V']],
 ['Monika',['3rd J','3V','5M','3M','(1-3) 3V / (4-6) 3V','5V','4M','5V','3J']]
];

const subjectCodes=[
 [/\bS\.?St\b/i,'SST'],[/\bEng(?:lish)?\b/i,'ENG'],[/\bMath(?:s)?\b/i,'MATH'],
 [/\bSci(?:ence)?\b/i,'SCI'],[/\bEco(?:nomics)?\.?\b/i,'ECO'],
 [/\bArt\b/i,'ART'],[/\bGK\b/i,'GK'],[/\bPhy\.?\s*Edu\.?\b/i,'PE'],
 [/\bComp(?:uter)?\b/i,'COMP'],[/\bSKT\b/i,'SKT'],[/\bHis(?:tory)?\b/i,'HIST']
];

export function parseHandwrittenLabel(rawLabel){
 const normalized=rawLabel.replace(/\(?\d+\s*-\s*\d+\)?/g,' ');
 const classMatch=normalized.match(/(?:^|\b)([3-9]|1[0-2])(?:st|nd|rd|th)?(?=\s|C|N|M|V|J|$)/i);
 const romanMatch=classMatch?null:normalized.match(/\b(XII|XI|IX|X|VIII|VII|VI|V|IV|III)\b/i);
 const romanGrades={III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10,XI:11,XII:12};
 const grade=classMatch?Number(classMatch[1]):romanMatch?romanGrades[romanMatch[1].toUpperCase()]:null;
 const matched=classMatch||romanMatch;
 const trailing=matched?normalized.slice(matched.index+matched[0].length):normalized;
 const sectionMatch=trailing.match(/^\s*(NC|C|M|V|J)(?=\s|$|\()/i);
 const streamMatch=rawLabel.match(/\b(Science|Sci|Commerce|Com|Arts?)\b/i);
 const groups=[...rawLabel.matchAll(/\(?(\d+\s*-\s*\d+)\)?/g)].map(m=>m[1].replace(/\s/g,''));
 const subject=subjectCodes.find(([pattern])=>pattern.test(rawLabel))?.[1]||null;
 const sectionCode=sectionMatch?.[1]?.toUpperCase()||null;
 return {
  classNumber:grade,
  sectionCode,
  sectionType:sectionCode==='NC'?'NON_COACHING':sectionCode==='C'?'COACHING':null,
  stream:streamMatch?({sci:'SCIENCE',science:'SCIENCE',com:'COMMERCE',commerce:'COMMERCE',art:'ARTS',arts:'ARTS'}[streamMatch[1].toLowerCase()]||null):null,
  subjectCode:subject,
  groups
 };
}

export const teacherRows=rawRows.map(([displayName,cells],index)=>({
 sourceRowId:`HANDWRITTEN-${String(index+1).padStart(2,'0')}`,
 displayName,
 rawName:displayName,
 rowNumber:index+1,
 cells
}));

export function buildReferenceImport(teachers,sections,subjects=[]){
 const ordered=teacherRows.map(row=>{
  const aliases=row.displayName==='Sandeep Kr. / Sandeep Kumar'?['Sandeep Kumar']:[row.displayName];
  const matches=aliases.flatMap(name=>teachers.filter(t=>t.name.trim().toLocaleLowerCase()===name.trim().toLocaleLowerCase()));
  const distinct=[...new Map(matches.map(t=>[String(t._id),t])).values()];
  const canMatch=distinct.length===1&&teacherRows.filter(r=>r.displayName===row.displayName).length===1;
  const teacher=canMatch?distinct[0]:null;
  return {...row,teacherId:teacher?String(teacher._id):row.sourceRowId,employeeId:teacher?.employeeId,matchStatus:teacher?'MATCHED':'UNMATCHED',needsReview:!teacher};
 });
 const slots=ordered.flatMap(row=>row.cells.map((rawLabel,index)=>{
  const value=String(rawLabel),blank=/^(?:—|-|–)?$/.test(value.trim());
  const unreadable=value==='UNREADABLE';
  const parsedLabel=parseHandwrittenLabel(value);
  const ambiguous=/\?|\b(?:11\/12|days)\b/i.test(value)||parsedLabel.groups.length>0;
  const sectionFor=parsed=>parsed.classNumber&&(parsed.sectionCode||parsed.stream)
   ?sections.find(s=>s.grade===parsed.classNumber&&(
    ['M','NC'].includes(parsed.sectionCode)&&/mars|non.?coaching|^m$/i.test(s.name)||
    ['V','C'].includes(parsed.sectionCode)&&/venus|coaching|^v$/i.test(s.name)||
    parsed.sectionCode==='J'&&/jupiter|^j$/i.test(s.name)||
    parsed.stream&&s.name.toUpperCase()===parsed.stream
   )):null;
  const segments=value.split('/').map(part=>part.trim()).filter(Boolean);
  const assignments=segments.flatMap(segment=>{
   const parsed=parseHandwrittenLabel(segment);
   const section=sectionFor(parsed);
   const group=segment.match(/\(?(\d+\s*-\s*\d+)\)?/)?.[1]?.replace(/\s/g,'');
   return group||segments.length>1?[{
    group,classNumber:parsed.classNumber,sectionCode:parsed.sectionCode,sectionType:parsed.sectionType,
    sectionId:section?String(section._id):undefined,stream:parsed.stream,subjectCode:parsed.subjectCode,rawLabel:segment
   }]:[];
  });
  const matchedSections=[sectionFor(parsedLabel),...assignments.map(assignment=>sections.find(item=>String(item._id)===assignment.sectionId))]
   .filter(Boolean);
  const streamOnlyLabel=(parsedLabel.stream==='SCIENCE'&&parsedLabel.subjectCode==='SCI')||
   (parsedLabel.stream==='COMMERCE'&&parsedLabel.subjectCode==='COM')||
   (parsedLabel.stream==='ARTS'&&parsedLabel.subjectCode==='ARTS');
  const subject=streamOnlyLabel?undefined:subjects.find(item=>item.subjectCode===parsedLabel.subjectCode);
  const grouped=parsedLabel.groups.length>0||value.includes('/');
  return {
   teacherId:row.teacherId,sourceRowId:row.sourceRowId,sectionIds:[...new Set(matchedSections.map(section=>String(section._id)))],subjectId:subject?String(subject._id):undefined,
   day:'REFERENCE_DAY',periodNumber:index+1,type:blank?'FREE':grouped?'COMBINED':'REGULAR',
   locked:false,rawLabel:value,parsedLabel,
   assignments,
   source:'HANDWRITTEN_TIMETABLE_2026',sourceType:'HANDWRITTEN_REFERENCE_DAY',
   confidence:unreadable?'TEMPORARY_DUMMY':ambiguous?'AMBIGUOUS':blank?'HIGH_CONFIDENCE':'VERIFIED_VISIBLE',
   needsReview:unreadable||ambiguous,notes:unreadable?'Unreadable in source image; replace after checking the paper timetable.':undefined,
   weekdayVerified:false
  };
 }));
 return {teacherOrder:ordered.map(({cells,...row})=>row),slots};
}
