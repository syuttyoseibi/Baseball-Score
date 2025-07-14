// IndexedDBの初期化
let db;
const dbName = "BaseballScoreDB";
const playerStoreName = "playerMaster";
const gameDataStoreName = "gameData";

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3);

        request.onerror = function(event) {
            console.error("Database error: " + event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            console.log("Database initialized");
            resolve();
        };

        request.onupgradeneeded = function(event) {
            console.log("Upgrading database...");
            let db = event.target.result;
            const transaction = event.target.transaction;

            if (!db.objectStoreNames.contains(playerStoreName)) {
                const playerStore = db.createObjectStore(playerStoreName, { keyPath: ['teamName', 'number'] });
                playerStore.createIndex('teamName', 'teamName');
            } else {
                const playerStore = transaction.objectStore(playerStoreName);
                if (!playerStore.indexNames.contains('teamName')) {
                    playerStore.createIndex('teamName', 'teamName');
                }
            }

            if (!db.objectStoreNames.contains(gameDataStoreName)) {
                db.createObjectStore(gameDataStoreName, { keyPath: "id" });
            }
            console.log("Object store created/updated for version 3");
        };
    });
}

// グローバル変数
let homePlayers = [];
let awayPlayers = [];
let gameData = {
    id: "current_game",
    date: '',
    location: '',
    homeTeamName: '我がチーム',
    awayTeamName: '相手チーム',
    status: 'ongoing',
    result: '',
    homeScore: [0, 0, 0, 0, 0, 0, 0],
    awayScore: [0, 0, 0, 0, 0, 0, 0],
    currentInning: 1,
    isTop: true,
    outs: 0,
    bases: [false, false, false],
    atBatHistory: [],
    substitutionHistory: []
};

// ===== 初期化処理 =====
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initDB();
        console.log("DB initialization complete.");

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('gameDate').value = today;

        setupEventListeners();
        console.log("Event listeners set up.");

        await loadGameData();
        console.log("Initial game data loaded and UI updated.");

        // UIの初期表示を更新
        updateDisplay();
        updateTeamNames();
        updatePlayersDisplay();
        updateBatterSelect();
        updateAtBatHistory();
        updatePlayerStatsDisplay();
        updateSubstitutionHistory();
        updateGameResultOptions();
        makeScoreEditable();
        updateBattingTeamSelect();

    } catch (error) {
        console.error("Initialization failed: ", error);
        showMessage('アプリケーションの初期化に失敗しました。', 'error');
    }
});


// ===== イベントリスナー設定 =====
function setupEventListeners() {
    // チーム名変更
    document.getElementById('homeTeamName').addEventListener('input', updateTeamNames);
    document.getElementById('awayTeamName').addEventListener('input', updateTeamNames);
    
    // 試合情報変更
    document.getElementById('gameDate').addEventListener('change', saveGameInfo);
    document.getElementById('gameLocation').addEventListener('change', saveGameInfo);
    document.getElementById('gameStatus').addEventListener('change', saveGameInfo);
    document.getElementById('gameResult').addEventListener('change', saveGameInfo);
    
    // ベースクリック
    document.getElementById('base1').addEventListener('click', () => toggleBase(1));
    document.getElementById('base2').addEventListener('click', () => toggleBase(2));
    document.getElementById('base3').addEventListener('click', () => toggleBase(3));
    
    // イニング・表裏変更
    document.getElementById('currentInning').addEventListener('change', function() {
        gameData.currentInning = parseInt(this.value);
        updateDisplay();
        saveGameData();
    });
    
    document.getElementById('topBottom').addEventListener('change', function() {
        gameData.isTop = this.value === 'top';
        updateBattingTeamSelect();
        updateDisplay();
        saveGameData();
    });

    // ページ離脱時の警告
    window.addEventListener('beforeunload', function(e) {
        if (gameData.atBatHistory.length > 0 || homePlayers.length > 0 || awayPlayers.length > 0) { 
            e.preventDefault();
            e.returnValue = ''; 
            return ''; 
        }
    });
}

// ===== チーム設定 =====
function updateTeamNames() {
    const homeTeamName = document.getElementById('homeTeamName').value || '後攻チーム';
    const awayTeamName = document.getElementById('awayTeamName').value || '先攻チーム';
    
    gameData.homeTeamName = homeTeamName;
    gameData.awayTeamName = awayTeamName;
    
    document.getElementById('homeTeamNameDisplay').textContent = homeTeamName;
    document.getElementById('awayTeamNameDisplay').textContent = awayTeamName;
    document.getElementById('homeTeamPlayersTitle').textContent = `${homeTeamName} 選手`;
    document.getElementById('awayTeamPlayersTitle').textContent = `${awayTeamName} 選手`;
    
    const playerTeamSelect = document.getElementById('playerTeam');
    playerTeamSelect.options[0].textContent = awayTeamName;
    playerTeamSelect.options[1].textContent = homeTeamName;
    
    const battingTeamSelect = document.getElementById('battingTeam');
    battingTeamSelect.options[0].textContent = awayTeamName;
    battingTeamSelect.options[1].textContent = homeTeamName;
    
    updateGameResultOptions();
    saveGameData();
}

function updateGameResultOptions() {
    const gameResult = document.getElementById('gameResult');
    const homeTeamName = gameData.homeTeamName;
    const awayTeamName = gameData.awayTeamName;
    
    gameResult.innerHTML = `
        <option value="">選択してください</option>
        <option value="home-win">${homeTeamName}勝利</option>
        <option value="away-win">${awayTeamName}勝利</option>
        <option value="draw">引き分け</option>
    `;
}

// ===== 選手登録・表示 =====
function addPlayer() {
    const teamSelect = document.getElementById('playerTeam');
    const nameInput = document.getElementById('playerName');
    const numberInput = document.getElementById('playerNumber');
    const positionSelect = document.getElementById('playerPosition');
    
    const team = teamSelect.value;
    const name = nameInput.value.trim();
    const number = parseInt(numberInput.value);
    const position = positionSelect.value;
    
    if (!name || isNaN(number) || number < 0 || number > 99) {
        showMessage('有効な選手名と背番号を入力してください', 'error', 'addPlayerErrorDisplay');
        return;
    }
    
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    
    if (targetPlayers.some(player => player.number === number && player.isActive)) {
        showMessage(`背番号 ${number} は既に使用されています。`, 'error', 'addPlayerErrorDisplay');
        return;
    }

    if (position && targetPlayers.some(player => player.position === position && player.isActive)) {
        showMessage(`${getPositionFullName(position)} の守備位置は既に使用されています。`, 'error', 'addPlayerErrorDisplay');
        return;
    }
    
    const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
    const player = {
        id: Date.now(),
        name: name,
        number: number,
        position: position || '',
        team: team,
        isActive: true,
        stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 }
    };
    
    targetPlayers.push(player);
    savePlayerToMaster(teamName, { name, number });
    
    nameInput.value = '';
    numberInput.value = '';
    positionSelect.value = '';
    
    updatePlayersDisplay();
    updateBatterSelect();
    showMessage('選手を追加しました', 'success', 'addPlayerErrorDisplay');
    saveGameData();
}

function updatePlayersDisplay() {
    const homePlayersList = document.getElementById('homePlayersList');
    const awayPlayersList = document.getElementById('awayPlayersList');
    
    homePlayersList.innerHTML = '';
    awayPlayersList.innerHTML = '';
    
    const createPlayerCard = (player, team) => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        const statusClass = player.isActive === false ? 'substituted' : '';
        playerCard.innerHTML = `
            <div class="player-number">${player.number}</div>
            <div class="player-name ${statusClass}">${player.name}</div>
            ${player.position ? `<div class="player-position">${getPositionFullName(player.position)}</div>` : ''}
            <div>
                <button class="edit-btn">編集</button>
                ${player.isActive !== false ? `<button class="substitute-btn">交代</button>` : '<span class="substituted-label">交代済</span>'}
            </div>
        `;
        playerCard.querySelector('.edit-btn').onclick = () => editPlayer(team, player.id);
        if (player.isActive !== false) {
            playerCard.querySelector('.substitute-btn').onclick = () => substitutePlayer(team, player.id);
        }
        return playerCard;
    };
    
    homePlayers.sort((a, b) => a.number - b.number).forEach(p => homePlayersList.appendChild(createPlayerCard(p, 'home')));
    awayPlayers.sort((a, b) => a.number - b.number).forEach(p => awayPlayersList.appendChild(createPlayerCard(p, 'away')));
}

// ===== 選手交代 =====
let currentSubstitutionData = null;

function substitutePlayer(team, playerId) {
    const player = (team === 'home' ? homePlayers : awayPlayers).find(p => p.id === playerId);
    if (!player) return;
    
    currentSubstitutionData = { team, playerId, player };
    
    const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
    document.getElementById('substitutionPlayerInfo').innerHTML = `
        <p><strong>交代対象:</strong> ${teamName} ${player.number} ${player.name} (${getPositionFullName(player.position) || '未指定'})</p>
        <p><strong>現在:</strong> ${gameData.currentInning}回${gameData.isTop ? '表' : '裏'}</p>
    `;
    
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newPlayerNumber').value = '';
    document.getElementById('newPlayerPosition').value = '';
    document.getElementById('substitutionModal').classList.add('visible');
}

function closeSubstitutionModal() {
    document.getElementById('substitutionModal').classList.remove('visible');
    currentSubstitutionData = null;
}

function confirmSubstitution() {
    if (!currentSubstitutionData) return;
    
    const newPlayerName = document.getElementById('newPlayerName').value.trim();
    const newPlayerNumber = parseInt(document.getElementById('newPlayerNumber').value);
    const newPlayerPosition = document.getElementById('newPlayerPosition').value;
    
    if (!newPlayerName || isNaN(newPlayerNumber) || newPlayerNumber < 0 || newPlayerNumber > 99) {
        showMessage('有効な選手名と背番号を入力してください', 'error', 'substitutionErrorDisplay');
        return;
    }
    
    const { team, player } = currentSubstitutionData;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    
    if (targetPlayers.some(p => p.number === newPlayerNumber && p.isActive)) {
        showMessage(`背番号 ${newPlayerNumber} は既に使用されています。`, 'error', 'substitutionErrorDisplay');
        return;
    }
    if (newPlayerPosition && targetPlayers.some(p => p.position === newPlayerPosition && p.isActive)) {
        showMessage(`${getPositionFullName(newPlayerPosition)} の守備位置は既に使用されています。`, 'error', 'substitutionErrorDisplay');
        return;
    }
    
    player.isActive = false;
    
    const newPlayer = {
        id: Date.now(),
        name: newPlayerName,
        number: newPlayerNumber,
        position: newPlayerPosition,
        team: team,
        isActive: true,
        stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 }
    };
    targetPlayers.push(newPlayer);
    
    gameData.substitutionHistory.push({
        inning: gameData.currentInning,
        half: gameData.isTop ? '表' : '裏',
        team: team === 'home' ? gameData.homeTeamName : gameData.awayTeamName,
        outPlayer: `${player.number} ${player.name}`,
        inPlayer: `${newPlayer.number} ${newPlayer.name}`,
        position: newPlayerPosition || '未指定',
        timestamp: new Date().toLocaleTimeString()
    });
    
    updatePlayersDisplay();
    updateBatterSelect();
    updateSubstitutionHistory();
    closeSubstitutionModal();
    showMessage(`${player.name} → ${newPlayer.name} の交代を記録しました`, 'success');
    saveGameData();
}

// ===== 選手編集 =====
let currentEditPlayerData = null;

function editPlayer(team, playerId) {
    const player = (team === 'home' ? homePlayers : awayPlayers).find(p => p.id === playerId);
    if (!player) return;

    currentEditPlayerData = { team, playerId, player };
    document.getElementById('editPlayerName').value = player.name;
    document.getElementById('editPlayerNumber').value = player.number;
    document.getElementById('editPlayerPosition').value = player.position || '';
    document.getElementById('editPlayerModal').classList.add('visible');
}

function closeEditPlayerModal() {
    document.getElementById('editPlayerModal').classList.remove('visible');
    currentEditPlayerData = null;
}

function confirmEditPlayer() {
    if (!currentEditPlayerData) return;
    
    const newName = document.getElementById('editPlayerName').value.trim();
    const newNumber = parseInt(document.getElementById('editPlayerNumber').value);
    const newPosition = document.getElementById('editPlayerPosition').value;
    
    if (!newName || isNaN(newNumber) || newNumber < 0 || newNumber > 99) {
        showMessage('有効な選手名と背番号を入力してください', 'error', 'editPlayerErrorDisplay');
        return;
    }
    
    const { team, player } = currentEditPlayerData;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    
    if (targetPlayers.some(p => p.id !== player.id && p.number === newNumber && p.isActive)) {
        showMessage(`背番号 ${newNumber} は既に使用されています。`, 'error', 'editPlayerErrorDisplay');
        return;
    }
    if (newPosition && targetPlayers.some(p => p.id !== player.id && p.position === newPosition && p.isActive)) {
        showMessage(`${getPositionFullName(newPosition)} の守備位置は既に使用されています。`, 'error', 'editPlayerErrorDisplay');
        return;
    }
    
    player.name = newName;
    player.number = newNumber;
    player.position = newPosition;
    
    updatePlayersDisplay();
    updateBatterSelect();
    updatePlayerStatsDisplay();
    closeEditPlayerModal();
    showMessage('選手情報を更新しました', 'success');
    saveGameData();
}

function deletePlayer() {
    if (!currentEditPlayerData) return;
    if (!confirm(`${currentEditPlayerData.player.name}選手を削除しますか？打席記録も失われます。`)) return;

    const { team, player } = currentEditPlayerData;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    const playerIndex = targetPlayers.findIndex(p => p.id === player.id);
    
    if (playerIndex !== -1) {
        targetPlayers.splice(playerIndex, 1);
        gameData.atBatHistory = gameData.atBatHistory.filter(record => record.playerId !== player.id);
        
        updatePlayersDisplay();
        updateBatterSelect();
        updatePlayerStatsDisplay();
        updateAtBatHistory();
        showMessage(`${player.name}選手を削除しました`, 'success');
    }
    
    closeEditPlayerModal();
    saveGameData();
}

// ===== 選手マスタ =====
async function openPlayerMasterModal() {
    const team = document.getElementById('playerTeam').value;
    const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
    const playerMasterModal = document.getElementById('playerMasterModal');
    const listDiv = document.getElementById('playerMasterList');
    listDiv.innerHTML = '';

    if (!db) {
        showMessage('データベースが利用できません。', 'error', 'playerMasterModalErrorDisplay');
        return;
    }

    const transaction = db.transaction([playerStoreName], "readonly");
    const store = transaction.objectStore(playerStoreName);
    const index = store.index("teamName");
    const request = index.getAll(teamName);

    request.onsuccess = function(event) {
        const players = event.target.result;
        if (players.length === 0) {
            listDiv.innerHTML = '<p>このチームの登録選手はいません。</p>';
        } else {
            players.sort((a, b) => a.number - b.number).forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'player-master-item';

                const infoSpan = document.createElement('span');
                infoSpan.textContent = `${player.number} ${player.name}`;
                infoSpan.onclick = () => addPlayerFromMaster(player);

                const editButton = document.createElement('button');
                editButton.className = 'edit-master-btn';
                editButton.textContent = '編集';
                editButton.onclick = (e) => {
                    e.stopPropagation();
                    openEditPlayerMasterModal(player);
                };

                playerDiv.appendChild(infoSpan);
                playerDiv.appendChild(editButton);
                listDiv.appendChild(playerDiv);
            });
        }
        playerMasterModal.classList.add('visible');
    };

    request.onerror = function(event) {
        showMessage('選手マスタの読み込みに失敗しました。', 'error', 'playerMasterModalErrorDisplay');
    };
}

function closePlayerMasterModal() {
    document.getElementById('playerMasterModal').classList.remove('visible');
}

function addPlayerFromMaster(player) {
    const team = document.getElementById('playerTeam').value;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;

    if (targetPlayers.some(p => p.number === player.number)) {
        showMessage(`背番号 ${player.number} は既に追加されています。`, 'error', 'playerMasterModalErrorDisplay');
        return;
    }

    const newPlayer = {
        id: Date.now(),
        name: player.name,
        number: player.number,
        position: '',
        team: team,
        isActive: true,
        stats: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, walks: 0, strikeouts: 0, rbis: 0 }
    };

    targetPlayers.push(newPlayer);
    updatePlayersDisplay();
    updateBatterSelect();
    showMessage(`選手 ${player.number} ${player.name} を追加しました。`, 'success');
    closePlayerMasterModal();
    saveGameData();
}

let currentEditingMasterPlayer = null;

function openEditPlayerMasterModal(player) {
    currentEditingMasterPlayer = player;
    document.getElementById('editPlayerMasterName').value = player.name;
    document.getElementById('editPlayerMasterNumber').value = player.number;
    document.getElementById('editPlayerMasterModal').classList.add('visible');
}

function closeEditPlayerMasterModal() {
    document.getElementById('editPlayerMasterModal').classList.remove('visible');
    currentEditingMasterPlayer = null;
}

async function confirmEditPlayerMaster() {
    if (!currentEditingMasterPlayer) return;

    const newName = document.getElementById('editPlayerMasterName').value.trim();
    const newNumber = parseInt(document.getElementById('editPlayerMasterNumber').value);

    if (!newName || isNaN(newNumber) || newNumber < 0 || newNumber > 99) {
        showMessage('有効な選手名と背番号を入力してください。', 'error', 'editPlayerMasterErrorDisplay');
        return;
    }

    const originalPlayer = currentEditingMasterPlayer;
    const updatedPlayer = { ...originalPlayer, name: newName, number: newNumber };

    const transaction = db.transaction([playerStoreName], "readwrite");
    const store = transaction.objectStore(playerStoreName);

    // If the number hasn't changed, just update the name
    if (originalPlayer.number === newNumber) {
        store.put(updatedPlayer).onsuccess = () => {
            finalizeMasterEdit();
        };
    } else {
        // If number has changed, check for conflicts, then delete old and put new
        const request = store.get([originalPlayer.teamName, newNumber]);
        request.onsuccess = () => {
            if (request.result) {
                showMessage(`背番号 ${newNumber} は既に使用されています。`, 'error', 'editPlayerMasterErrorDisplay');
                return;
            }
            store.delete([originalPlayer.teamName, originalPlayer.number]).onsuccess = () => {
                store.put(updatedPlayer).onsuccess = () => {
                    finalizeMasterEdit();
                };
            };
        };
    }
    
    function finalizeMasterEdit() {
        showMessage('選手情報を更新しました。', 'success');
        closeEditPlayerMasterModal();
        closePlayerMasterModal();
        openPlayerMasterModal();
    }
}

function deletePlayerFromMaster() {
    if (!currentEditingMasterPlayer) return;
    if (!confirm(`${currentEditingMasterPlayer.name}選手をマスタから完全に削除しますか？`)) return;

    const playerToDelete = currentEditingMasterPlayer;
    const transaction = db.transaction([playerStoreName], "readwrite");
    const store = transaction.objectStore(playerStoreName);
    const request = store.delete([playerToDelete.teamName, playerToDelete.number]);

    request.onsuccess = () => {
        showMessage('選手をマスタから削除しました。', 'success');
        closeEditPlayerMasterModal();
        closePlayerMasterModal();
        openPlayerMasterModal();
    };
}


// ===== スコア・打席 =====
function updateDisplay() {
    // スコアボード
    for (let i = 0; i < 7; i++) {
        document.getElementById(`home-${i + 1}`).textContent = gameData.homeScore[i];
        document.getElementById(`away-${i + 1}`).textContent = gameData.awayScore[i];
    }
    document.getElementById('home-total').textContent = gameData.homeScore.reduce((a, b) => a + b, 0);
    document.getElementById('away-total').textContent = gameData.awayScore.reduce((a, b) => a + b, 0);
    
    // イニング
    document.getElementById('currentInning').value = gameData.currentInning;
    document.getElementById('topBottom').value = gameData.isTop ? 'top' : 'bottom';
    
    // アウト
    document.getElementById('outCount').textContent = gameData.outs;
    
    // ベース
    for (let i = 0; i < 3; i++) {
        document.getElementById(`base${i + 1}`).classList.toggle('occupied', gameData.bases[i]);
    }
}

function makeScoreEditable() {
    for (let team of ['home', 'away']) {
        for (let inning = 1; inning <= 7; inning++) {
            const cell = document.getElementById(`${team}-${inning}`);
            cell.addEventListener('click', function() {
                const input = document.createElement('input');
                input.type = 'number';
                input.value = this.textContent;
                input.min = '0';
                input.style.width = '50px';
                input.style.textAlign = 'center';
                
                this.innerHTML = '';
                this.appendChild(input);
                input.focus();
                
                const saveScore = () => {
                    const newValue = parseInt(input.value) || 0;
                    if (team === 'home') gameData.homeScore[inning - 1] = newValue;
                    else gameData.awayScore[inning - 1] = newValue;
                    updateDisplay();
                    saveGameData();
                };

                input.addEventListener('blur', saveScore);
                input.addEventListener('keypress', (e) => { if (e.key === 'Enter') input.blur(); });
            });
        }
    }
}

function toggleBase(baseNumber) {
    gameData.bases[baseNumber - 1] = !gameData.bases[baseNumber - 1];
    updateDisplay();
    saveGameData();
}

function addOut() {
    if (gameData.outs < 2) {
        gameData.outs++;
    } else {
        changeInning();
    }
    updateDisplay();
    saveGameData();
}

function resetOuts() {
    gameData.outs = 0;
    updateDisplay();
    saveGameData();
}

function changeInning() {
    if (gameData.isTop) {
        gameData.isTop = false;
    } else {
        gameData.isTop = true;
        if(gameData.currentInning < 7) gameData.currentInning++;
    }
    gameData.outs = 0;
    gameData.bases = [false, false, false];
    updateDisplay();
    updateBattingTeamSelect();
}

function updateBatterSelect() {
    const battingTeam = document.getElementById('battingTeam').value;
    const batterSelect = document.getElementById('batterSelect');
    batterSelect.innerHTML = '<option value="">選手を選択</option>';
    
    const targetPlayers = battingTeam === 'home' ? homePlayers : awayPlayers;
    targetPlayers
        .filter(player => player.isActive)
        .sort((a, b) => a.number - b.number)
        .forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.number} ${player.name}`;
            batterSelect.appendChild(option);
        });
}

function updateBattingTeamSelect() {
    document.getElementById('battingTeam').value = gameData.isTop ? 'away' : 'home';
    updateBatterSelect();
}

function recordAtBat() {
    const batterId = document.getElementById('batterSelect').value;
    const result = document.getElementById('atBatResult').value;
    const runs = parseInt(document.getElementById('runsScored').value) || 0;
    
    if (!batterId || !result) {
        showMessage('打者と打席結果を選択してください', 'error');
        return;
    }
    
    const player = [...homePlayers, ...awayPlayers].find(p => p.id == batterId);
    if (!player) return;
    
    updatePlayerStats(player, result, runs);
    
    if (runs > 0) {
        const inningIndex = gameData.currentInning - 1;
        if (player.team === 'home') gameData.homeScore[inningIndex] += runs;
        else gameData.awayScore[inningIndex] += runs;
    }
    
    gameData.atBatHistory.push({
        id: Date.now(),
        playerId: player.id,
        result: result,
        runs: runs,
        inning: gameData.currentInning,
        isTop: gameData.isTop,
        battingTeam: player.team
    });
    
    if (['strikeout', 'groundout', 'flyout'].includes(result)) {
        addOut();
    }
    
    updateDisplay();
    updateAtBatHistory();
    updatePlayerStatsDisplay();
    
    document.getElementById('atBatResult').value = '';
    document.getElementById('runsScored').value = '0';
    showMessage('打席結果を記録しました', 'success');
    saveGameData();
}

// ===== 履歴・成績 =====
function updateAtBatHistory() {
    const historyDiv = document.getElementById('atBatHistory');
    historyDiv.innerHTML = '';
    
    gameData.atBatHistory.slice().reverse().forEach(record => {
        const player = [...homePlayers, ...awayPlayers].find(p => p.id === record.playerId);
        if (!player) return;

        const recordDiv = document.createElement('div');
        recordDiv.className = 'at-bat-record';
        recordDiv.innerHTML = `
            <div class="details">
                ${record.inning}回${record.isTop ? '表' : '裏'} - ${player.number} ${player.name}: ${getResultText(record.result)}
                ${record.runs > 0 ? ` (${record.runs}得点)` : ''}
            </div>
            <button class="edit-btn">編集</button>
        `;
        recordDiv.querySelector('.edit-btn').onclick = () => editAtBat(record.id);
        historyDiv.appendChild(recordDiv);
    });
}

function updatePlayerStatsDisplay() {
    const statsDiv = document.getElementById('statsTable');
    const allPlayers = [...homePlayers, ...awayPlayers];
    if (allPlayers.length === 0) {
        statsDiv.innerHTML = '<p>登録された選手がいません</p>';
        return;
    }
    
    let tableHTML = `<table class="stats-table">...`; // (Implementation unchanged)
    statsDiv.innerHTML = tableHTML;
}

function updateSubstitutionHistory() {
    const historyDiv = document.getElementById('substitutionHistory');
    if (!gameData.substitutionHistory || gameData.substitutionHistory.length === 0) {
        historyDiv.innerHTML = '<p>交代記録はありません</p>';
        return;
    }
    
    let html = '<div class="substitution-records">';
    gameData.substitutionHistory.forEach(r => {
        html += `<div class="substitution-record">...</div>`; // (Implementation unchanged)
    });
    historyDiv.innerHTML = html + '</div>';
}

function updatePlayerStats(player, result, runs, isReverting = false) {
    // (Implementation unchanged)
}

// ===== データ管理 =====
function saveGameData() {
    if (!db) return;
    const transaction = db.transaction([gameDataStoreName], "readwrite");
    const store = transaction.objectStore(gameDataStoreName);
    const dataToSave = { ...gameData, homePlayers, awayPlayers };
    store.put(dataToSave);
}

function loadGameData() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve();
        const transaction = db.transaction([gameDataStoreName], "readonly");
        const store = transaction.objectStore(gameDataStoreName);
        const request = store.get("current_game");

        request.onsuccess = function(event) {
            const loadedData = event.target.result;
            if (loadedData) {
                Object.assign(gameData, loadedData);
                homePlayers = loadedData.homePlayers || [];
                awayPlayers = loadedData.awayPlayers || [];
                showMessage('前回の試合データをロードしました', 'success');
            }
            resolve();
        };
        request.onerror = function(event) {
            reject(event.target.errorCode);
        };
    });
}

function resetGame() {
    if (!confirm('現在の試合データをすべてリセットしますか？')) return;
    
    // Reset variables
    homePlayers = [];
    awayPlayers = [];
    gameData = { /* ... initial state ... */ };

    // Clear DB
    if (db) {
        const transaction = db.transaction([gameDataStoreName], "readwrite");
        transaction.objectStore(gameDataStoreName).delete("current_game");
    }

    // Update UI
    updateDisplay();
    updateTeamNames();
    updatePlayersDisplay();
    // ... and so on for all UI update functions
    showMessage('試合データをリセットしました', 'success');
}

function savePlayerToMaster(teamName, player) {
    if (!db) return;
    const transaction = db.transaction([playerStoreName], "readwrite");
    const store = transaction.objectStore(playerStoreName);
    store.put({ teamName: teamName, ...player });
}

// ===== ヘルパー関数 =====
function showMessage(message, type, targetElementId = null) {
    // (Implementation unchanged)
}

function getResultText(result) {
    // (Implementation unchanged)
}

function getPositionFullName(positionAbbr) {
    // (Implementation unchanged)
}

function openHelpModal() {
    document.getElementById('helpModal').classList.add('visible');
}

function closeHelpModal() {
    document.getElementById('helpModal').classList.remove('visible');
}

// (Other modal close functions: closeEditAtBatModal, etc. are unchanged)
