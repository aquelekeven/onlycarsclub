const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/auth.js'), 'utf8');
const context = {Date};
vm.runInNewContext(source.slice(source.indexOf('  function parseSignupBirthDate'), source.indexOf('  function setupSignup()')), context);
const today = new Date(2026, 9, 13);
for (const [value, expected] of [
  ['25/01/2005', '2005-01-25'], ['29/02/2004', '2004-02-29'],
  ['29/02/2005', null], ['31/04/2005', null], ['00/01/2005', null],
  ['25/13/2005', null], ['25/01/0005', null], ['25/01/20', null],
  ['', null], ['13/10/2026', '2026-10-13'], ['14/10/2026', null]
]) assert.equal(context.parseSignupBirthDate(value, today), expected, value);
const handlers = {};
const input = {value:'', selectionStart:0, addEventListener:(type, fn)=>handlers[type]=fn,
  setCustomValidity(message){this.error=message;},setSelectionRange(start){this.selectionStart=start;}};
context.setupSignupBirthDate(input);
for (const digit of '25012005') {
  input.value += digit; input.selectionStart=input.value.length; handlers.input();
}
assert.equal(input.value, '25/01/2005');
handlers.blur(); assert.equal(input.error, '');
input.value='29022005';input.selectionStart=8;handlers.input();handlers.blur();assert(input.error);
input.value='29/02/2004';input.selectionStart=10;handlers.input();handlers.blur();assert.equal(input.error,'');
input.value='';input.selectionStart=0;handlers.input();assert.equal(input.value,'');
assert.match(fs.readFileSync(path.join(__dirname,'../cadastro.html'),'utf8'), /name="birth_date" type="text" inputmode="numeric"/);
console.log('PASS: numeric typing, paste, clearing, correction, leap years, invalid and future dates, ISO conversion');
