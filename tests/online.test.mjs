import { isDeepStrictEqual } from 'node:util';
import { newGame, applyAction } from '../src/game/engine.js';
import { actorOf, createRoom, hostAct, hostReceive, hostLeave, hostReclaim, guestReceive, emptyView } from '../src/game/online.js';
import { chooseAction } from './bot.mjs';

let pass = 0, fail = 0;
const memo = { traded: false };
function check(name, cond) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
}

// An in-memory network: the host, plus guests by id, each with a message inbox.
function network(game) {
  const net = { room: createRoom(game), views: {}, errors: {} };
  const deliver = out => {
    for (const { to, msg } of out) {
      for (const id of to === '*' ? Object.keys(net.views) : [to]) {
        net.views[id] = guestReceive(net.views[id], msg);
        if (msg.t === 'error') net.errors[id] = msg.message;
        if (net.views[id].stale) { net.views[id] = { ...net.views[id], stale: false }; fromGuest(id, { t: 'resync' }); }
      }
    }
  };
  const fromGuest = (id, msg) => {
    const r = hostReceive(net.room, id, msg);
    net.room = r.room;
    deliver(r.out);
    return r;
  };
  net.join = (id, name) => { net.views[id] = emptyView(); fromGuest(id, { t: 'hello', name }); };
  net.send = fromGuest;
  net.host = actions => { const r = hostAct(net.room, actions); net.room = r.room; deliver(r.out); return r; };
  net.leave = id => { delete net.views[id]; const r = hostLeave(net.room, id); net.room = r.room; deliver(r.out); };
  return net;
}

// --- who acts
const g0 = newGame({ seed: 3 });
check('roll is made by the current player', actorOf(g0.state, { type: 'roll' }) === 0);
check('placements are made by their player field', actorOf(g0.state, { type: 'placeRoad', player: 2, edge: 1 }) === 2);
check('sandbox edits are host-only', actorOf(g0.state, { type: 'sandbox', edit: { op: 'resume' } }) === null);
check('scripted dice are host-only', actorOf(g0.state, { type: 'setDiceQueue', queue: [] }) === null);
check('unknown actions have no actor', actorOf(g0.state, { type: 'hack', player: 0 }) === null);
check('out-of-range players have no actor', actorOf(g0.state, { type: 'placeRoad', player: 9, edge: 1 }) === null);

// --- joining and seats
const net = network(newGame({ seed: 11 }));
net.join('ann', '  Ann  ');
net.join('bo', 'x'.repeat(60));
check('a guest gets the game on joining', isDeepStrictEqual(net.views.ann.game.state, net.room.game.state));
check('names are trimmed and capped', net.room.names.ann === 'Ann' && net.room.names.bo.length === 24);
net.send('ann', { t: 'claim', seat: 1 });
net.send('bo', { t: 'claim', seat: 1 });
check('a taken seat cannot be claimed', net.room.seats[1] === 'ann' && net.errors.bo === 'That seat is taken');
net.send('bo', { t: 'claim', seat: 2 });
check('everyone sees the seat list', isDeepStrictEqual(net.views.ann.seats, [null, 'ann', 'bo', null]) && isDeepStrictEqual(net.views.bo.seats, net.room.seats));

net.send('bo', { t: 'claim', seat: 3 });
check('taking a second seat moves the guest (one seat each)', net.room.seats[2] === null && net.room.seats[3] === 'bo');
net.send('bo', { t: 'claim', seat: 2 });
const back = hostReclaim(net.room, 2);
check('the host can take a seat back', back.room.seats[2] === null && back.out[0].msg.t === 'seats');
check('reclaiming an empty seat does nothing', hostReclaim(back.room, 2).out.length === 0);

// --- moves are checked against seats
const firstMove = chooseAction(net.room.game.state, memo); // player 0, the host's seat
net.send('ann', { t: 'act', actions: [firstMove] });
check("a guest can't move for the host's seat", net.room.game.actions.length === 0 && net.errors.ann === "That isn't your move to make");
net.send('ann', { t: 'act', actions: [{ type: 'sandbox', edit: { op: 'resume' } }] });
check("a guest can't edit the position", net.room.game.actions.length === 0);
net.send('ann', { t: 'act', actions: 'garbage' });
net.send('ann', null);
net.send('ann', { t: 'nonsense' });
check('malformed messages change nothing', net.room.game.actions.length === 0);

// --- a whole game, each seat played by its owner, everyone kept in step
const owner = { 0: null, 1: 'ann', 2: 'bo', 3: null };
let steps = 0, rejected = 0;
while (net.room.game.state.winner === null && steps < 4000) {
  const state = net.room.game.state;
  const action = chooseAction(state, memo);
  if (!action) break;
  const actor = actorOf(state, action);
  const who = actor === null ? null : owner[actor];
  const before = net.room.game.actions.length;
  if (who === null) net.host([action]); else net.send(who, { t: 'act', actions: [action] });
  if (net.room.game.actions.length === before) rejected++;
  steps++;
}
check('the game plays to a winner through the room', net.room.game.state.winner !== null);
check('no legal move was refused', rejected === 0);
check('both guests end on exactly the host state', ['ann', 'bo'].every(id => isDeepStrictEqual(net.views[id].game.state, net.room.game.state)));

// --- a guest that falls behind resyncs
const lagger = network(newGame({ seed: 4 }));
lagger.join('cy', 'Cy');
lagger.views.cy = { ...lagger.views.cy, game: null };
lagger.host([chooseAction(lagger.room.game.state, memo)]);
check('a guest out of step asks for the game again and catches up', isDeepStrictEqual(lagger.views.cy.game?.state, lagger.room.game.state));
const gap = guestReceive(lagger.views.cy, { t: 'append', index: 99, actions: [] });
check('an append from the future marks the view stale', gap.stale === true);

// --- leaving frees the seat
lagger.send('cy', { t: 'claim', seat: 3 });
lagger.leave('cy');
check('a guest who leaves gives their seat back to the host', lagger.room.seats[3] === null && !('cy' in lagger.room.names));

// --- a bad sync is reported, not applied
const bad = guestReceive(emptyView(), { t: 'sync', options: { seed: -1 }, actions: [] });
check("a broken game from the host is reported", bad.game === null && typeof bad.error === 'string');

// --- no-op moves are not broadcast
const quiet = network(newGame({ seed: 8 }));
let g = quiet.room.game;
while (g.state.phase === 'setup') g = applyAction(g, chooseAction(g.state, memo));
quiet.room = { ...quiet.room, game: g };
quiet.join('di', 'Di');
const roll = quiet.host([{ type: 'roll' }]);
const again = quiet.host([{ type: 'roll' }]);
check('a move that changes nothing sends nothing', roll.out.length === 1 && again.out.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
