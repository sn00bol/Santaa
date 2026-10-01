const { getRandomMineral } = require('./mineCore');

const GRID_TOTAL_CELLS = 25; // 5x5 layout
const PLAYABLE_CELLS = 22; // indices 0..21 are playable

const activeSessions = new Map(); // userId -> session

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateBoard() {
    const bombCount = randomInt(3, 4);
    const mineralCount = randomInt(4, 6);
    
    // special cells
    const chestCount = Math.random() < 0.4 ? 1 : 0;
    const trapCount = Math.random() < 0.3 ? 1 : 0;
    const goldMineCount = Math.random() < 0.15 ? 1 : 0;

    const indices = shuffle([...Array(PLAYABLE_CELLS).keys()]); // 0..21
    
    let currentIndex = 0;
    const bombSet = new Set(indices.slice(currentIndex, currentIndex += bombCount));
    const mineralIndices = indices.slice(currentIndex, currentIndex += mineralCount);
    const chestIndices = new Set(indices.slice(currentIndex, currentIndex += chestCount));
    const trapIndices = new Set(indices.slice(currentIndex, currentIndex += trapCount));
    const goldMineIndices = new Set(indices.slice(currentIndex, currentIndex += goldMineCount));

    const board = Array.from({ length: GRID_TOTAL_CELLS }, (_, i) => {
        if (i === 22) return { type: 'exit', revealed: false };
        if (i === 23) return { type: 'flagToggle', revealed: false };
        if (i === 24) return { type: 'cashout', revealed: false };
        
        if (bombSet.has(i)) return { type: 'bomb', revealed: false, adjacentMines: 0, mineral: null, flagged: false };
        if (chestIndices.has(i)) return { type: 'chest', revealed: false, adjacentMines: 0, flagged: false };
        if (trapIndices.has(i)) return { type: 'trap', revealed: false, adjacentMines: 0, flagged: false };
        if (goldMineIndices.has(i)) return { type: 'goldmine', revealed: false, adjacentMines: 0, flagged: false };
        
        return { type: 'empty', revealed: false, adjacentMines: 0, mineral: null, flagged: false };
    });

    for (const idx of mineralIndices) {
        board[idx] = { type: 'mineral', revealed: false, adjacentMines: 0, mineral: getRandomMineral(), flagged: false };
    }

    // compute adjacent bombs
    for (let i = 0; i < PLAYABLE_CELLS; i++) {
        if (board[i].type === 'bomb' || board[i].type === 'goldmine') continue;
        board[i].adjacentMines = countAdjacentBombs(board, i);
    }

    return { board, bombCount: bombCount + goldMineCount, safeCells: PLAYABLE_CELLS - bombCount - goldMineCount };
}

function getNeighbors(index) {
    const row = Math.floor(index / 5);
    const col = index % 5;
    const neighbors = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr >= 5 || nc < 0 || nc >= 5) continue;
            const ni = nr * 5 + nc;
            // Skip action cells
            if (ni >= PLAYABLE_CELLS) continue;
            neighbors.push(ni);
        }
    }
    return neighbors;
}

function countAdjacentBombs(board, index) {
    return getNeighbors(index).filter(i => board[i].type === 'bomb' || board[i].type === 'goldmine').length;
}

function revealCell(session, index) {
    if (!session || !session.board) return { changed: false };
    const cell = session.board[index];
    if (!cell || cell.revealed || cell.type === 'cashout' || cell.type === 'exit' || cell.type === 'flagToggle') return { changed: false };

    cell.revealed = true;
    session.revealedCount = (session.revealedCount || 0) + 1;

    if (cell.type === 'bomb') return { hitBomb: true, isGoldMine: false };
    if (cell.type === 'goldmine') return { hitBomb: true, isGoldMine: true, revealedType: 'goldmine' };
    
    if (cell.type === 'chest') return { hitBomb: false, revealedType: 'chest' };
    if (cell.type === 'trap') return { hitBomb: false, revealedType: 'trap' };

    if (cell.type === 'mineral') {
        // store sourceIndex so single-item commits can be handled
        const item = Object.assign({}, cell.mineral, { sourceIndex: index });
        session.sessionLoot.push(item);
        cell.keepable = true;
        return { hitBomb: false, revealedType: 'mineral', mineral: item };
    }

    if (cell.type === 'empty' && cell.adjacentMines === 0) {
        floodReveal(session, index);
        return { hitBomb: false, revealedType: 'empty' };
    }
    return { hitBomb: false, revealedType: cell.type };
}

function floodReveal(session, startIndex) {
    const queue = [startIndex];
    const seen = new Set([startIndex]);
    while (queue.length) {
        const idx = queue.shift();
        for (const ni of getNeighbors(idx)) {
            const c = session.board[ni];
            if (!c || c.revealed || c.type === 'bomb' || c.type === 'goldmine' || c.type === 'cashout' || c.type === 'exit' || c.type === 'flagToggle') continue;
            c.revealed = true;
            session.revealedCount = (session.revealedCount || 0) + 1;
            if (c.type === 'mineral') {
                const item = Object.assign({}, c.mineral, { sourceIndex: ni });
                session.sessionLoot.push(item);
                c.keepable = true;
            }
            if (c.type === 'empty' && c.adjacentMines === 0 && !seen.has(ni)) {
                seen.add(ni);
                queue.push(ni);
            }
        }
    }
}

function shuffleUnrevealed(session) {
    const unrevealedIndices = [];
    const unrevealedCells = [];
    
    for (let i = 0; i < PLAYABLE_CELLS; i++) {
        if (!session.board[i].revealed) {
            unrevealedIndices.push(i);
            unrevealedCells.push(session.board[i]);
        }
    }
    
    shuffle(unrevealedCells);
    
    for (let i = 0; i < unrevealedIndices.length; i++) {
        session.board[unrevealedIndices[i]] = unrevealedCells[i];
    }
    
    // Recompute adjacent mines since board changed
    for (let i = 0; i < PLAYABLE_CELLS; i++) {
        if (session.board[i].type === 'bomb' || session.board[i].type === 'goldmine') continue;
        session.board[i].adjacentMines = countAdjacentBombs(session.board, i);
    }
}

module.exports = {
    activeSessions,
    generateBoard,
    getNeighbors,
    countAdjacentBombs,
    revealCell,
    floodReveal,
    shuffleUnrevealed
};
