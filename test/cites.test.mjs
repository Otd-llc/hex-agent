import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citedRefs, staleCitations, parseFeatures, DEFAULT_FEATURES } from '../src/agent.mjs';

test('citedRefs takes full refs and leaves counts, shorthand and bearing lists', () => {
  const text = 'piece:0,0,1;half-s and bin:0,0,1~hex-bin-half-s-full, drawer:0#0,0#cut, notch:1#0,1#notch1. ' +
    'Also piece:2, piece:full, cover:full;top and cap:0,0,0;*;30,90,150,210,270,330.';
  assert.deepEqual(citedRefs(text).sort(), ['bin:0,0,1~hex-bin-half-s-full', 'drawer:0#0,0#cut', 'notch:1#0,1#notch1', 'piece:0,0,1;half-s'].sort());
});

// 5da5ce71 (workbench-organizer, 6d9d39d2): claimed two storeys from four bases; the build kept two.
const state = {
  nodes: [
    { ref: 'piece:0,0,1;half-s' }, { ref: 'piece:1,0,1;half-s' }, { ref: 'bin:0,0,1~hex-bin-half-s-full' }, { ref: 'cap:0,0,1;#;90' },
  ],
  staging: { props: [{ ref: 'prop:1' }] },
};

test('staleCitations sends back a met claim that cites parts no longer on the build', () => {
  const finish = { requirements: [
    { requirement: 'Two storeys', status: 'met', evidence: 'piece:0,0,0;half-s + piece:1,0,0;half-s at level 0 and piece:0,0,1;half-s + piece:1,0,1;half-s at level 1' },
    { requirement: 'Bins on top', status: 'met', evidence: 'bin:0,0,1~hex-bin-half-s-full on level 1' },
    { requirement: 'A drawer', status: 'unmet', evidence: 'drawer:0#0,0#cut was removed' },
  ] };
  assert.deepEqual(staleCitations(finish, state), [
    { id: 'Two storeys', why: 'cites piece:0,0,0;half-s, piece:1,0,0;half-s, not on the build (see get_build)' },
  ]);
});

test('staleCitations accepts a ref written without its variant, and has nothing to say when every ref is there', () => {
  const finish = { requirements: [{ requirement: 'cap', status: 'met', evidence: 'cap:0,0,1;#;90 on piece:0,0,1' }] };
  assert.deepEqual(staleCitations(finish, state), []);
});

test('the citation check is a feature, off by default', () => {
  assert.equal(DEFAULT_FEATURES.cites, false);
  assert.equal(parseFeatures('abstain,cites').cites, true);
});
