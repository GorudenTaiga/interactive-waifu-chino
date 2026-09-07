import fs from 'fs';
import { Parser } from 'mmd-parser';

const buffer = fs.readFileSync('model/Chino MMD mine/Chino.pmx');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const parser = new Parser();
const pmx = parser.parsePmx(arrayBuffer, true);

console.log('PMX Keys:', Object.keys(pmx));
if (pmx.metadata) console.log('Metadata:', pmx.metadata);
if (pmx.morphs) {
  console.log('Morphs count:', pmx.morphs.length);
  pmx.morphs.slice(0, 30).forEach((m, i) => console.log(i, m.name, m.englishName));
}
if (pmx.bones) {
  console.log('Bones count:', pmx.bones.length);
  pmx.bones.forEach((b, i) => console.log(i, b.name, b.englishName));
}
