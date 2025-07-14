// IndexedDBの初期化
let db;
const dbName = "BaseballScoreDB";
const playerStoreName = "playerMaster";
const gameDataStoreName = "gameData"; // 新しいストア名

function initDB() {
    const request = indexedDB.open(dbName, 2); // バージョンを2に上げる

    request.onerror = function(event) {
        console.error("Database error: " + event.target.errorCode);
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        console.log("Database initialized");
        loadGameData(); // データベース初期化後にゲームデータをロード
    };

    request.onupgradeneeded = function(event) {
        let db = event.target.result;
        // 既存のplayerMasterストア
        if (!db.objectStoreNames.contains(playerStoreName)) {
            db.createObjectStore(playerStoreName, { keyPath: ['teamName', 'number'] });
        }
        // 新しいgameDataストア
        if (!db.objectStoreNames.contains(gameDataStoreName)) {
            db.createObjectStore(gameDataStoreName, { keyPath: "id" });
        }
        console.log("Object store created/updated");
    };
}

// グローバル変数（セッション中のみ保持）
let homePlayers = [];
let awayPlayers = [];
let gameData = {
    id: "current_game", // gameDataストアのキー
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
    bases: [false, false, false], // 1塁、2塁、3塁
    atBatHistory: [],
    substitutionHistory: []
};

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    initDB();
    // 今日の日付を設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('gameDate').value = today;
    
    // イベントリスナー設定
    setupEventListeners();
    updateDisplay();
    updateTeamNames();
});

// イベントリスナー設定
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
        // 試合データが保存されている、または変更がある場合に警告を表示
        // より厳密な変更検知は複雑になるため、ここではデータが存在すれば警告とします。
        if (gameData.atBatHistory.length > 0 || homePlayers.length > 0 || awayPlayers.length > 0) { 
            e.preventDefault();
            e.returnValue = ''; 
            return ''; 
        }
    });
}

// チーム名更新
function updateTeamNames() {
    const homeTeamName = document.getElementById('homeTeamName').value || '後攻チーム';
    const awayTeamName = document.getElementById('awayTeamName').value || '先攻チーム';
    
    gameData.homeTeamName = homeTeamName;
    gameData.awayTeamName = awayTeamName;
    
    // スコアボード更新
    document.getElementById('homeTeamNameDisplay').textContent = homeTeamName;
    document.getElementById('awayTeamNameDisplay').textContent = awayTeamName;
    
    // 選手リストタイトル更新
    document.getElementById('homeTeamPlayersTitle').textContent = `${homeTeamName} 選手`;
    document.getElementById('awayTeamPlayersTitle').textContent = `${awayTeamName} 選手`;
    
    // 選手登録のチーム選択更新
    const playerTeamSelect = document.getElementById('playerTeam');
    playerTeamSelect.options[0].textContent = awayTeamName;
    playerTeamSelect.options[1].textContent = homeTeamName;
    
    // 打席チーム選択更新
    const battingTeamSelect = document.getElementById('battingTeam');
    battingTeamSelect.options[0].textContent = awayTeamName;
    battingTeamSelect.options[1].textContent = homeTeamName;
    
    // 試合結果のオプションを更新
    updateGameResultOptions();
    saveGameData();
}

// 試合結果のオプションを更新
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

// 選手追加
function addPlayer() {
    const teamSelect = document.getElementById('playerTeam');
    const nameInput = document.getElementById('playerName');
    const numberInput = document.getElementById('playerNumber');
    const positionSelect = document.getElementById('playerPosition');
    
    const team = teamSelect.value;
    const name = nameInput.value.trim();
    const number = parseInt(numberInput.value);
    const position = positionSelect.value;
    
    if (!name) {
        showMessage('選手名を入力してください', 'error', 'addPlayerErrorDisplay');
        return;
    }
    
    if (number === null || number < 0 || number > 99) {
        showMessage('背番号は0-99の範囲で入力してください', 'error', 'addPlayerErrorDisplay');
        return;
    }
    
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    
    // 背番号重複チェック
    if (targetPlayers.some(player => player.number === number && player.isActive)) {
        showMessage(`背番号 ${number} は既に使用されています。`, 'error', 'addPlayerErrorDisplay');
        return;
    }

    // 守備位置重複チェック（守備位置が選択されている場合のみ）
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
        stats: {
            atBats: 0,
            hits: 0,
            doubles: 0,
            triples: 0,
            homeRuns: 0,
            walks: 0,
            strikeouts: 0,
            rbis: 0
        }
    };
    
    targetPlayers.push(player);
    savePlayerToMaster(teamName, { name, number });
    
    // 入力フィールドをクリア
    nameInput.value = '';
    numberInput.value = '';
    positionSelect.value = '';
    
    updatePlayersDisplay();
    updateBatterSelect();
    showMessage('選手を追加しました', 'success', 'addPlayerErrorDisplay');
    saveGameData();
}

// 選手表示更新
function updatePlayersDisplay() {
    const homePlayersList = document.getElementById('homePlayersList');
    const awayPlayersList = document.getElementById('awayPlayersList');
    
    homePlayersList.innerHTML = '';
    awayPlayersList.innerHTML = '';
    
    // ホームチーム選手表示
    homePlayers.sort((a, b) => a.number - b.number).forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        const statusClass = player.isActive === false ? 'substituted' : '';
        playerCard.innerHTML = `
            <div class="player-number">${player.number}</div>
            <div class="player-name ${statusClass}">${player.name}</div>
            ${player.position ? `<div class="player-position">${getPositionFullName(player.position)}</div>` : ''}
            <div>
                <button class="edit-btn" onclick="editPlayer('home', ${player.id})">編集</button>
                ${player.isActive !== false ? `<button class="substitute-btn" onclick="substitutePlayer('home', ${player.id})">交代</button>` : '<span class="substituted-label">交代済</span>'}
            </div>
        `;
        homePlayersList.appendChild(playerCard);
    });
    
    // ビジターチーム選手表示
    awayPlayers.sort((a, b) => a.number - b.number).forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        const statusClass = player.isActive === false ? 'substituted' : '';
        playerCard.innerHTML = `
            <div class="player-number">${player.number}</div>
            <div class="player-name ${statusClass}">${player.name}</div>
            ${player.position ? `<div class="player-position">${getPositionFullName(player.position)}</div>` : ''}
            <div>
                <button class="edit-btn" onclick="editPlayer('away', ${player.id})">編集</button>
                ${player.isActive !== false ? `<button class="substitute-btn" onclick="substitutePlayer('away', ${player.id})">交代</button>` : '<span class="substituted-label">交代済</span>'}
            </div>
        `;
        awayPlayersList.appendChild(playerCard);
    });
}

// 選手交代機能（モーダル版）
let currentSubstitutionData = null;

function substitutePlayer(team, playerId) {
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    const player = targetPlayers.find(p => p.id === playerId);
    
    if (!player) {
        showMessage('選手が見つかりません', 'error');
        return;
    }
    
    // 交代データを保存
    currentSubstitutionData = { team, playerId, player };
    
    // モーダルに選手情報を表示
    const playerInfo = document.getElementById('substitutionPlayerInfo');
    const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
    playerInfo.innerHTML = `
        <p><strong>交代対象選手:</strong> ${teamName} ${player.number} ${player.name} (${getPositionFullName(player.position) || '未指定'})</p>
        <p><strong>現在:</strong> ${gameData.currentInning}回${gameData.isTop ? '表' : '裏'}</p>
    `;
    
    // フォームをクリア
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newPlayerNumber').value = '';
    document.getElementById('newPlayerPosition').value = '';
    
    // モーダルを表示
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
    
    // バリデーション
    if (!newPlayerName) {
        showMessage('選手名を入力してください', 'error', 'substitutionErrorDisplay');
        return;
    }
    
    if (newPlayerNumber === null || newPlayerNumber < 0 || newPlayerNumber > 99) {
        showMessage('背番号は0-99の範囲で入力してください', 'error', 'substitutionErrorDisplay');
        return;
    }
    
    const { team, player } = currentSubstitutionData;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    
    // 背番号重複チェック（アクティブな選手のみ）
    if (targetPlayers.some(p => p.number === newPlayerNumber && p.isActive)) {
        showMessage(`背番号 ${newPlayerNumber} は既に使用されています。`, 'error', 'substitutionErrorDisplay');
        return;
    }

    // 守備位置重複チェック（守備位置が選択されている場合のみ）
    if (newPlayerPosition && targetPlayers.some(p => p.position === newPlayerPosition && p.isActive)) {
        showMessage(`${getPositionFullName(newPlayerPosition)} の守備位置は既に使用されています。`, 'error', 'substitutionErrorDisplay');
        return;
    }
    
    // 元の選手を交代済みにマーク
    player.isActive = false;
    player.substitutedInning = gameData.currentInning;
    player.substitutedHalf = gameData.isTop ? '表' : '裏';
    
    // 新しい選手を追加
    const newPlayer = {
        id: Date.now(),
        name: newPlayerName,
        number: newPlayerNumber,
        position: newPlayerPosition,
        team: team,
        isActive: true,
        substitutedFor: player.id,
        enteredInning: gameData.currentInning,
        enteredHalf: gameData.isTop ? '表' : '裏',
        stats: {
            atBats: 0,
            hits: 0,
            doubles: 0,
            triples: 0,
            homeRuns: 0,
            walks: 0,
            strikeouts: 0,
            rbis: 0
        }
    };
    
    targetPlayers.push(newPlayer);
    
    // 交代記録を履歴に追加
    const substitutionRecord = {
        inning: gameData.currentInning,
        half: gameData.isTop ? '表' : '裏',
        team: team === 'home' ? gameData.homeTeamName : gameData.awayTeamName,
        type: 'substitution',
        outPlayer: `${player.number} ${player.name}`,
        inPlayer: `${newPlayer.number} ${newPlayer.name}`,
        position: newPlayerPosition || '未指定',
        timestamp: new Date().toLocaleTimeString()
    };
    
    if (!gameData.substitutionHistory) {
        gameData.substitutionHistory = [];
    }
    gameData.substitutionHistory.push(substitutionRecord);
    
    // 表示更新
    updatePlayersDisplay();
    updateBatterSelect();
    updateSubstitutionHistory();
    
    // モーダルを閉じる
    closeSubstitutionModal();
    
    showMessage(`${player.name} → ${newPlayer.name} の交代を記録しました`, 'success');
    saveGameData();
}

// 選手編集機能
let currentEditPlayerData = null;

function editPlayer(team, playerId) {
    console.log("editPlayer called for team: ", team, " playerId: ", playerId);
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    const player = targetPlayers.find(p => p.id === playerId);
    
    if (!player) {
        showMessage('選手が見つかりません', 'error');
        console.error("Player not found for editing: ", playerId);
        return;
    }
    
    // 編集データを保存
    currentEditPlayerData = { team, playerId, player };
    
    // フォームに現在の値を設定
    document.getElementById('editPlayerName').value = player.name;
    document.getElementById('editPlayerNumber').value = player.number;
    document.getElementById('editPlayerPosition').value = player.position || '';
    
    // モーダルを表示
    document.getElementById('editPlayerModal').classList.add('visible');
}

function closeEditPlayerModal() {
    document.getElementById('editPlayerModal').classList.remove('visible');
    currentEditPlayerData = null;
    // エラーメッセージをクリア
    const errorDisplay = document.getElementById('editPlayerErrorDisplay');
    if (errorDisplay) {
        errorDisplay.innerHTML = '';
    }
}

function confirmEditPlayer() {
    if (!currentEditPlayerData) return;
    
    const newName = document.getElementById('editPlayerName').value.trim();
    const newNumber = parseInt(document.getElementById('editPlayerNumber').value);
    const newPosition = document.getElementById('editPlayerPosition').value;
    
    // バリデーション
    if (!newName) {
        showMessage('選手名を入力してください', 'error', 'editPlayerErrorDisplay');
        return;
    }
    
    if (newNumber === null || newNumber < 0 || newNumber > 99) {
        showMessage('背番号は0-99の範囲で入力してください', 'error', 'editPlayerErrorDisplay');
        return;
    }
    
    const { team, player } = currentEditPlayerData;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    
    // 背番号重複チェック（自分以外、かつアクティブな選手のみ）
    if (targetPlayers.some(p => p.id !== player.id && p.number === newNumber && p.isActive)) {
        showMessage(`背番号 ${newNumber} は既に使用されています。`, 'error', 'editPlayerErrorDisplay');
        return;
    }

    // 守備位置重複チェック（自分以外、かつアクティブな選手で、守備位置が選択されている場合のみ）
    if (newPosition && targetPlayers.some(p => p.id !== player.id && p.position === newPosition && p.isActive)) {
        showMessage(`${getPositionFullName(newPosition)} の守備位置は既に使用されています。`, 'error', 'editPlayerErrorDisplay');
        return;
    }
    
    // 選手情報を更新
    player.name = newName;
    player.number = newNumber;
    player.position = newPosition;
    
    // 表示更新
    updatePlayersDisplay();
    updateBatterSelect();
    updateStatsDisplay();
    
    // モーダルを閉じる
    closeEditPlayerModal();
    
    showMessage('選手情報を更新しました', 'success'); // 成功メッセージはグローバルに表示
    saveGameData();
}

function deletePlayer() {
    if (!currentEditPlayerData) return;
    
    const { team, player } = currentEditPlayerData;
    
    // 打席記録がある場合は警告
    if (player.stats.atBats > 0) {
        if (!confirm(`${player.name}選手には打席記録があります。削除すると記録も失われます。本当に削除しますか？`)) {
            return;
        }
    } else {
        if (!confirm(`${player.name}選手を削除しますか？`)) {
            return;
        }
    }
    
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;
    const playerIndex = targetPlayers.findIndex(p => p.id === player.id);
    
    if (playerIndex !== -1) {
        targetPlayers.splice(playerIndex, 1);
        
        // 打席記録履歴からも削除
        gameData.atBatHistory = gameData.atBatHistory.filter(record => record.playerId !== player.id);
        
        // 表示更新
        updatePlayersDisplay();
        updateBatterSelect();
        updateStatsDisplay();
        updateAtBatHistory();
        
        showMessage(`${player.name}選手を削除しました`, 'success');
    }
    
    // モーダルを閉じる
    closeEditPlayerModal();
    saveGameData();
}

// 交代履歴表示更新
function updateSubstitutionHistory() {
    const historyDiv = document.getElementById('substitutionHistory');
    if (!historyDiv) return;
    
    if (!gameData.substitutionHistory || gameData.substitutionHistory.length === 0) {
        historyDiv.innerHTML = '<p>交代記録はありません</p>';
        return;
    }
    
    let historyHTML = '<div class="substitution-records">';
    gameData.substitutionHistory.forEach(record => {
        historyHTML += `
            <div class="substitution-record">
                <div class="substitution-info">
                    <strong>${record.inning}回${record.half}</strong> - ${record.team}
                </div>
                <div class="substitution-details">
                    ${record.outPlayer} → ${record.inPlayer} (${getPositionFullName(record.position)})
                </div>
                <div class="substitution-time">${record.timestamp}</div>
            </div>
        `;
    });
    historyHTML += '</div>';
    historyDiv.innerHTML = historyHTML;
}

// 打者選択更新
function updateBatterSelect() {
    const battingTeam = document.getElementById('battingTeam').value;
    const batterSelect = document.getElementById('batterSelect');
    batterSelect.innerHTML = '<option value="">選手を選択</option>';
    
    const targetPlayers = battingTeam === 'home' ? homePlayers : awayPlayers;
    
    targetPlayers
        .filter(player => player.isActive !== false) // アクティブな選手のみ
        .sort((a, b) => a.number - b.number)
        .forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.number} ${player.name}`;
            batterSelect.appendChild(option);
        });
}

// 打席チーム選択に基づく表裏自動設定
function updateBattingTeamSelect() {
    const battingTeamSelect = document.getElementById('battingTeam');
    if (gameData.isTop) {
        battingTeamSelect.value = 'away'; // 表はビジターチーム
    } else {
        battingTeamSelect.value = 'home'; // 裏はホームチーム
    }
    updateBatterSelect();
}

// アウトカウント追加
function addOut() {
    if (gameData.outs < 3) {
        gameData.outs++;
        if (gameData.outs === 3) {
            // 3アウトでイニング終了
            changeInning();
        }
        updateDisplay();
    }
    saveGameData();
}

// アウトカウントリセット
function resetOuts() {
    gameData.outs = 0;
    updateDisplay();
    saveGameData();
}

// イニング変更
function changeInning() {
    if (gameData.isTop) {
        gameData.isTop = false; // 裏へ
    } else {
        gameData.isTop = true; // 次のイニング表へ
        gameData.currentInning++;
    }
    
    gameData.outs = 0;
    gameData.bases = [false, false, false];
    updateDisplay();
    saveGameData();
}

// ベースクリック処理
function toggleBase(baseNumber) {
    gameData.bases[baseNumber - 1] = !gameData.bases[baseNumber - 1];
    updateDisplay();
    saveGameData();
}

// 打席結果記録
function recordAtBat() {
    const battingTeam = document.getElementById('battingTeam').value;
    const batterSelect = document.getElementById('batterSelect');
    const atBatResult = document.getElementById('atBatResult');
    const runsScored = document.getElementById('runsScored');
    
    const batterId = batterSelect.value;
    const result = atBatResult.value;
    const runs = parseInt(runsScored.value) || 0;
    
    if (!batterId) {
        showMessage('打者を選択してください', 'error');
        return;
    }
    
    if (!result) {
        showMessage('打席結果を選択してください', 'error');
        return;
    }
    
    const allPlayers = [...homePlayers, ...awayPlayers];
    const player = allPlayers.find(p => p.id == batterId);
    if (!player) {
        showMessage('選手が見つかりません', 'error');
        return;
    }
    
    // 統計更新
    updatePlayerStats(player, result, runs);
    
    // スコア更新
    if (runs > 0) {
        const inningIndex = gameData.currentInning - 1;
        if (inningIndex >= 0 && inningIndex < 7) {
            if (battingTeam === 'home') {
                gameData.homeScore[inningIndex] += runs;
            } else {
                gameData.awayScore[inningIndex] += runs;
            }
        }
    }
    
    // 打席履歴に追加
    const atBatRecord = {
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        inning: gameData.currentInning,
        isTop: gameData.isTop,
        playerId: player.id,
        result: result,
        runs: runs,
        battingTeam: battingTeam
    };
    gameData.atBatHistory.push(atBatRecord);
    
    // アウトカウント更新
    if (['strikeout', 'groundout', 'flyout', 'strikeoutWildPitch'].includes(result)) {
        addOut();
    }
    
    // 表示更新
    updateDisplay();
    updateAtBatHistory();
    updatePlayerStatsDisplay();
    
    // フォームリセット
    atBatResult.value = '';
    runsScored.value = '0';
    
    showMessage('打席結果を記録しました', 'success');
    saveGameData();
}

// 選手統計更新
function updatePlayerStats(player, result, runs, isReverting = false) {
    const stats = player.stats;
    const multiplier = isReverting ? -1 : 1;

    // 打席数
    if (!['walk', 'hbp', 'strikeoutWildPitch'].includes(result)) {
        stats.atBats += multiplier;
    }
    
    // 安打
    if (['single', 'double', 'triple', 'homerun', 'runningHomerun'].includes(result)) {
        stats.hits += multiplier;
    }
    
    // 各種安打
    switch (result) {
        case 'double':
            stats.doubles += multiplier;
            break;
        case 'triple':
            stats.triples += multiplier;
            break;
        case 'homerun':
        case 'runningHomerun':
            stats.homeRuns += multiplier;
            break;
        case 'walk':
            stats.walks += multiplier;
            break;
        case 'strikeout':
        case 'strikeoutWildPitch':
            stats.strikeouts += multiplier;
            break;
    }
    
    // 打点
    stats.rbis += (runs * multiplier);
}

// 表示更新
function updateDisplay() {
    // スコアボード更新
    for (let i = 0; i < 7; i++) {
        document.getElementById(`home-${i + 1}`).textContent = gameData.homeScore[i];
        document.getElementById(`away-${i + 1}`).textContent = gameData.awayScore[i];
    }
    
    // 合計スコア
    const homeTotal = gameData.homeScore.reduce((a, b) => a + b, 0);
    const awayTotal = gameData.awayScore.reduce((a, b) => a + b, 0);
    document.getElementById('home-total').textContent = homeTotal;
    document.getElementById('away-total').textContent = awayTotal;
    
    // 現在のイニング
    document.getElementById('currentInning').value = gameData.currentInning;
    document.getElementById('topBottom').value = gameData.isTop ? 'top' : 'bottom';
    
    // アウトカウント
    document.getElementById('outCount').textContent = gameData.outs;
    
    // ベース状況
    for (let i = 0; i < 3; i++) {
        const base = document.getElementById(`base${i + 1}`);
        if (gameData.bases[i]) {
            base.classList.add('occupied');
        } else {
            base.classList.remove('occupied');
        }
    }
}

// 打席履歴更新
function updateAtBatHistory() {
    const historyDiv = document.getElementById('atBatHistory');
    historyDiv.innerHTML = '';
    
    gameData.atBatHistory.slice().reverse().forEach(record => {
        const recordDiv = document.createElement('div');
        recordDiv.className = 'at-bat-record';
        
        const allPlayers = [...homePlayers, ...awayPlayers];
        const player = allPlayers.find(p => p.id === record.playerId);
        
        if (!player) return;

        const resultText = getResultText(record.result);
        const inningText = `${record.inning}回${record.isTop ? '表' : '裏'}`;
        
        recordDiv.innerHTML = `
            <div class="timestamp">${record.timestamp} - ${inningText}</div>
            <div class="details">
                ${player.number} ${player.name}: ${resultText}
                ${record.runs > 0 ? ` (${record.runs}得点)` : ''}
            </div>
            <button class="edit-btn" onclick="editAtBat(${record.id})">編集</button>
        `;
        
        historyDiv.appendChild(recordDiv);
    });
}

// 結果テキスト取得
function getResultText(result) {
    const resultMap = {
        'single': '単打',
        'double': '二塁打',
        'triple': '三塁打',
        'homerun': 'ホームラン',
        'runningHomerun': 'ランニングホームラン',
        'walk': 'フォアボール',
        'hbp': 'デッドボール',
        'strikeout': '三振',
        'strikeoutWildPitch': '振り逃げ',
        'groundout': 'ゴロアウト',
        'flyout': 'フライアウト',
        'error': 'エラー'
    };
    return resultMap[result] || result;
}

// 守備位置の略称から正式名称へのマッピング
function getPositionFullName(positionAbbr) {
    const positionMap = {
        'P': 'ピッチャー',
        'C': 'キャッチャー',
        '1B': 'ファースト',
        '2B': 'セカンド',
        '3B': 'サード',
        'SS': 'ショート',
        'LF': 'レフト',
        'CF': 'センター',
        'RF': 'ライト',
        'DH': '指名打者'
    };
    return positionMap[positionAbbr] || positionAbbr; // マッピングがなければそのまま返す
}

// 選手成績表示更新
function updatePlayerStatsDisplay() {
    const statsDiv = document.getElementById('statsTable');
    
    const allPlayers = [...homePlayers, ...awayPlayers];
    if (allPlayers.length === 0) {
        statsDiv.innerHTML = '<p>登録された選手がいません</p>';
        return;
    }
    
    let tableHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>チーム</th>
                    <th>背番号</th>
                    <th>選手名</th>
                    <th>守備位置</th>
                    <th>打席</th>
                    <th>安打</th>
                    <th>打率</th>
                    <th>2塁打</th>
                    <th>3塁打</th>
                    <th>本塁打</th>
                    <th>打点</th>
                    <th>四球</th>
                    <th>三振</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // ホームチーム選手
    homePlayers.sort((a, b) => a.number - b.number).forEach(player => {
        const stats = player.stats;
        const avg = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
        
        tableHTML += `
            <tr>
                <td>${gameData.homeTeamName}</td>
                <td>${player.number}</td>
                <td>${player.name}</td>
                <td>${getPositionFullName(player.position) || '-'}</td>
                <td>${stats.atBats}</td>
                <td>${stats.hits}</td>
                <td>${avg}</td>
                <td>${stats.doubles}</td>
                <td>${stats.triples}</td>
                <td>${stats.homeRuns}</td>
                <td>${stats.rbis}</td>
                <td>${stats.walks}</td>
                <td>${stats.strikeouts}</td>
            </tr>
        `;
    });
    
    // ビジターチーム選手
    awayPlayers.sort((a, b) => a.number - b.number).forEach(player => {
        const stats = player.stats;
        const avg = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
        
        tableHTML += `
            <tr>
                <td>${gameData.awayTeamName}</td>
                <td>${player.number}</td>
                <td>${player.name}</td>
                <td>${getPositionFullName(player.position) || '-'}</td>
                <td>${stats.atBats}</td>
                <td>${stats.hits}</td>
                <td>${avg}</td>
                <td>${stats.doubles}</td>
                <td>${stats.triples}</td>
                <td>${stats.homeRuns}</td>
                <td>${stats.rbis}</td>
                <td>${stats.walks}</td>
                <td>${stats.strikeouts}</td>
            </tr>
        `;
    });
    
    tableHTML += '</tbody></table>';
    statsDiv.innerHTML = tableHTML;
}

// 履歴クリア
function clearHistory() {
    if (confirm('打席記録履歴をクリアしますか？')) {
        gameData.atBatHistory = [];
        updateAtBatHistory();
        showMessage('履歴をクリアしました', 'success');
    }
    saveGameData();
}

// メッセージ表示
function showMessage(message, type, targetElementId = null) {
    let messageContainer;
    if (targetElementId) {
        messageContainer = document.getElementById(targetElementId);
        if (!messageContainer) {
            console.error(`Target element with ID ${targetElementId} not found.`);
            return;
        }
        // 既存のメッセージをクリア
        messageContainer.innerHTML = '';
    } else {
        // 既存のグローバルメッセージをクリア
        const existingGlobalMessage = document.querySelector('.message');
        if (existingGlobalMessage) {
            existingGlobalMessage.remove();
        }
        // グローバルメッセージ用のコンテナを作成または取得
        messageContainer = document.createElement('div');
        messageContainer.className = 'global-message-container'; // 新しいクラス名
        const firstSection = document.querySelector('section');
        firstSection.parentNode.insertBefore(messageContainer, firstSection);
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageContainer.appendChild(messageDiv);
    
    // 3秒後に自動削除
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
        // もしコンテナが空になったら、コンテナ自体も削除（グローバルメッセージの場合のみ）
        if (!targetElementId && messageContainer.children.length === 0 && messageContainer.parentNode) {
            messageContainer.remove();
        }
    }, 3000);
}

// 試合情報保存
function saveGameInfo() {
    gameData.date = document.getElementById('gameDate').value;
    gameData.location = document.getElementById('gameLocation').value;
    gameData.status = document.getElementById('gameStatus').value;
    gameData.result = document.getElementById('gameResult').value;
    saveGameData();
}

// PDF形式でダウンロード（日本語対応）
function downloadGamePDF() {
    try {
        // 隠しdivを作成してPDF用のコンテンツを生成
        const pdfContent = document.createElement('div');
        pdfContent.style.cssText = `
            position: absolute;
            left: -9999px;
            top: 0;
            width: 800px;
            background: white;
            padding: 20px;
            font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', 'Meiryo', sans-serif;
            font-size: 12px;
            line-height: 1.5;
        `;
        
        // PDF用のHTMLコンテンツを生成
        pdfContent.innerHTML = `
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 24px; margin: 0;">⚾ 少年野球試合記録</h1>
                <p style="font-size: 14px; margin: 10px 0;">試合日: ${gameData.date || document.getElementById('gameDate').value || '未設定'}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 5px;">試合情報</h2>
                <p><strong>会場:</strong> ${gameData.location || document.getElementById('gameLocation').value || '未設定'}</p>
                <p><strong>対戦:</strong> ${gameData.awayTeamName} vs ${gameData.homeTeamName}</p>
                <p><strong>試合状況:</strong> ${gameData.status === 'finished' ? '終了' : '進行中'}</p>
                <p><strong>試合結果:</strong> ${getGameResultText()}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 5px;">最終スコア</h2>
                <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
                    <tr style="background: #f0f0f0;">
                        <th style="border: 1px solid #333; padding: 8px;">チーム</th>
                        <th style="border: 1px solid #333; padding: 8px;">1回</th>
                        <th style="border: 1px solid #333; padding: 8px;">2回</th>
                        <th style="border: 1px solid #333; padding: 8px;">3回</th>
                        <th style="border: 1px solid #333; padding: 8px;">4回</th>
                        <th style="border: 1px solid #333; padding: 8px;">5回</th>
                        <th style="border: 1px solid #333; padding: 8px;">6回</th>
                        <th style="border: 1px solid #333; padding: 8px;">7回</th>
                        <th style="border: 1px solid #333; padding: 8px; background: #e0e0e0;">合計</th>
                    </tr>
                    <tr>
                        <td style="border: 1px solid #333; padding: 8px; font-weight: bold;">${gameData.awayTeamName}</td>
                        ${generateScoreRow('away')}
                    </tr>
                    <tr>
                        <td style="border: 1px solid #333; padding: 8px; font-weight: bold;">${gameData.homeTeamName}</td>
                        ${generateScoreRow('home')}
                    </tr>
                </table>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 5px;">選手別成績</h2>
                ${generatePlayerStatsRows()}
            </div>
            
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 5px;">打席記録履歴</h2>
                ${generateAtBatHistoryTableRows()}
            </div>
            
            ${gameData.substitutionHistory && gameData.substitutionHistory.length > 0 ? `
            <div style="margin-bottom: 20px;">
                <h2 style="font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 5px;">選手交代履歴</h2>
                <div style="font-size: 10px;">
                    ${generateSubstitutionHistoryRows()}
                </div>
            </div>
            ` : ''}
        `;
        
        document.body.appendChild(pdfContent);
        
        // html2canvasでPDF生成
        html2canvas(pdfContent, {
            scale: 2,
            useCORS: true,
            allowTaint: true
        }).then(canvas => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210; // A4幅
            const pageHeight = 295; // A4高さ
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            
            let position = 0;
            
            // 最初のページ
            doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            
            // 複数ページ対応
            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                doc.addPage();
                doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            
            // クリーンアップ
            document.body.removeChild(pdfContent);
            
            // ファイル名生成
            const fileName = `baseball_game_${gameData.date || 'unknown'}_${gameData.homeTeamName}_vs_${gameData.awayTeamName}.pdf`;
            
            // PDFダウンロード
            doc.save(fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_'));
            
            showMessage('PDF形式で試合結果をダウンロードしました', 'success');
        }).catch(error => {
            console.error('PDF生成エラー:', error);
            document.body.removeChild(pdfContent);
            showMessage('PDF生成中にエラーが発生しました', 'error');
        });
        
    } catch (error) {
        console.error('PDF生成エラー:', error);
        showMessage('PDF生成中にエラーが発生しました: ' + error.message, 'error');
    }
}

// 試合結果テキストを取得
function getGameResultText() {
    const result = document.getElementById('gameResult').value;
    if (!result) return '未確定';
    
    switch(result) {
        case 'home-win': return `${gameData.homeTeamName}勝利`;
        case 'away-win': return `${gameData.awayTeamName}勝利`;
        case 'draw': return '引き分け';
        default: return '未確定';
    }
}

// スコア行を生成
function generateScoreRow(team) {
    let html = '';
    let total = 0;
    
    // gameDataの構造を確認
    console.log('generateScoreRow called with team:', team);
    console.log('gameData.homeScore:', gameData.homeScore);
    console.log('gameData.awayScore:', gameData.awayScore);
    
    for (let i = 0; i < 7; i++) {
        let score = 0;
        if (team === 'home' && gameData.homeScore && gameData.homeScore[i] !== undefined) {
            score = gameData.homeScore[i];
        } else if (team === 'away' && gameData.awayScore && gameData.awayScore[i] !== undefined) {
            score = gameData.awayScore[i];
        }
        total += score;
        html += `<td style="border: 1px solid #333; padding: 8px; text-align: center;">${score}</td>`;
    }
    html += `<td style="border: 1px solid #333; padding: 8px; text-align: center; font-weight: bold; background: #e0e0e0;">${total}</td>`;
    return html;
}

// 選手成績行を生成
function generatePlayerStatsRows() {
    let html = '';

    // 先攻チームの選手別成績
    html += `
        <h3 style="font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${gameData.awayTeamName} 選手別打撃成績</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px;">
            <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #333; padding: 6px;">背番号</th>
                <th style="border: 1px solid #333; padding: 6px;">選手名</th>
                <th style="border: 1px solid #333; padding: 6px;">守備</th>
                <th style="border: 1px solid #333; padding: 6px;">打席</th>
                <th style="border: 1px solid #333; padding: 6px;">安打</th>
                <th style="border: 1px solid #333; padding: 6px;">打率</th>
                <th style="border: 1px solid #333; padding: 6px;">打点</th>
            </tr>
    `;
    awayPlayers.sort((a, b) => a.number - b.number).forEach(player => {
        const stats = player.stats || {
            atBats: 0, hits: 0, rbis: 0
        };
        const average = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
        
        html += `
            <tr>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${player.number}</td>
                <td style="border: 1px solid #333; padding: 6px;">${player.name}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${getPositionFullName(player.position) || ''}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.atBats}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.hits}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${average}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.rbis}</td>
            </tr>
        `;
    });
    html += '</table>';

    // 後攻チームの選手別成績
    html += `
        <h3 style="font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${gameData.homeTeamName} 選手別打撃成績</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px;">
            <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #333; padding: 6px;">背番号</th>
                <th style="border: 1px solid #333; padding: 6px;">選手名</th>
                <th style="border: 1px solid #333; padding: 6px;">守備</th>
                <th style="border: 1px solid #333; padding: 6px;">打席</th>
                <th style="border: 1px solid #333; padding: 6px;">安打</th>
                <th style="border: 1px solid #333; padding: 6px;">打率</th>
                <th style="border: 1px solid #333; padding: 6px;">打点</th>
            </tr>
    `;
    homePlayers.sort((a, b) => a.number - b.number).forEach(player => {
        const stats = player.stats || {
            atBats: 0, hits: 0, rbis: 0
        };
        const average = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
        
        html += `
            <tr>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${player.number}</td>
                <td style="border: 1px solid #333; padding: 6px;">${player.name}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${getPositionFullName(player.position) || ''}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.atBats}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.hits}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${average}</td>
                <td style="border: 1px solid #333; padding: 6px; text-align: center;">${stats.rbis}</td>
            </tr>
        `;
    });
    html += '</table>';

    return html;
}

// 打席履歴テーブル行を生成
function generateAtBatHistoryTableRows() {
    let html = '';
    const allPlayers = [...homePlayers, ...awayPlayers];

    // 先攻チームの打席履歴
    const awayTeamHistory = gameData.atBatHistory.filter(record => record.battingTeam === 'away');
    if (awayTeamHistory.length > 0) {
        html += `
            <h3 style="font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${gameData.awayTeamName} 打席記録履歴</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px;">
                <tr style="background: #f0f0f0;">
                    <th style="border: 1px solid #333; padding: 6px;">イニング</th>
                    <th style="border: 1px solid #333; padding: 6px;">背番号</th>
                    <th style="border: 1px solid #333; padding: 6px;">選手名</th>
                    <th style="border: 1px solid #333; padding: 6px;">打席結果</th>
                    <th style="border: 1px solid #333; padding: 6px;">得点</th>
                </tr>
        `;
        awayTeamHistory.forEach(record => {
            const inning = record.inning || 1;
            const half = record.isTop ? '表' : '裏';
            const player = allPlayers.find(p => p.id === record.playerId);
            const playerNumber = player ? player.number : '';
            const playerName = player ? player.name : '';
            const result = getResultText(record.result) || record.result || '';
            const runs = record.runs || 0;

            html += `
                <tr>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center;">${inning}回${half}</td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center;">${playerNumber}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${playerName}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${result}</td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center;">${runs}点</td>
                </tr>
            `;
        });
        html += '</table>';
    } else {
        html += `<h3 style="font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${gameData.awayTeamName} 打席記録履歴</h3><p style="padding: 10px;">打席記録はありません</p>`;
    }


    // 後攻チームの打席履歴
    const homeTeamHistory = gameData.atBatHistory.filter(record => record.battingTeam === 'home');
    if (homeTeamHistory.length > 0) {
        html += `
            <h3 style="font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${gameData.homeTeamName} 打席記録履歴</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10px;">
                <tr style="background: #f0f0f0;">
                    <th style="border: 1px solid #333; padding: 6px;">イニング</th>
                    <th style="border: 1px solid #333; padding: 6px;">背番号</th>
                    <th style="border: 1px solid #333; padding: 6px;">選手名</th>
                    <th style="border: 1px solid #333; padding: 6px;">打席結果</th>
                    <th style="border: 1px solid #333; padding: 6px;">得点</th>
                </tr>
        `;
        homeTeamHistory.forEach(record => {
            const inning = record.inning || 1;
            const half = record.isTop ? '表' : '裏';
            const player = allPlayers.find(p => p.id === record.playerId);
            const playerNumber = player ? player.number : '';
            const playerName = player ? player.name : '';
            const result = getResultText(record.result) || record.result || '';
            const runs = record.runs || 0;

            html += `
                <tr>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center;">${inning}回${half}</td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center;">${playerNumber}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${playerName}</td>
                    <td style="border: 1px solid #333; padding: 6px;">${result}</td>
                    <td style="border: 1px solid #333; padding: 6px; text-align: center;">${runs}点</td>
                </tr>
            `;
        });
        html += '</table>';
    } else {
        html += `<h3 style="font-size: 16px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">${gameData.homeTeamName} 打席記録履歴</h3><p style="padding: 10px;">打席記録はありません</p>`;
    }

    return html;
}

// 交代履歴行を生成
function generateSubstitutionHistoryRows() {
    let html = '';
    if (gameData.substitutionHistory && gameData.substitutionHistory.length > 0) {
        gameData.substitutionHistory.forEach(record => {
            const inning = record.inning || 1;
            const half = record.half || '表';
            const outPlayer = record.outPlayer || '';
            const inPlayer = record.inPlayer || '';
            const position = record.position || '';
            
            html += `
                <div style="margin: 5px 0; padding: 5px; border-bottom: 1px solid #ddd;">
                    <strong>${inning}回${half}</strong> - 
                    ${outPlayer} → ${inPlayer} (${getPositionFullName(position)})
                </div>
            `;
        });
    }
    return html || '<div style="padding: 10px;">交代記録はありません</div>';
}

// スコア直接編集機能
function makeScoreEditable() {
    for (let team of ['home', 'away']) {
        for (let inning = 1; inning <= 7; inning++) {
            const cell = document.getElementById(`${team}-${inning}`);
            cell.addEventListener('click', function() {
                const currentValue = this.textContent;
                const input = document.createElement('input');
                input.type = 'number';
                input.value = currentValue;
                input.min = '0';
                input.style.width = '50px';
                input.style.textAlign = 'center';
                
                this.innerHTML = '';
                this.appendChild(input);
                input.focus();
                input.select();
                
                input.addEventListener('blur', function() {
                    const newValue = parseInt(this.value) || 0;
                    if (team === 'home') {
                        gameData.homeScore[inning - 1] = newValue;
                    } else {
                        gameData.awayScore[inning - 1] = newValue;
                    }
                    updateDisplay();
                    saveGameData();
                });
                
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        this.blur();
                    }
                });
            });
        }
    }
}

// ベースクリック処理
function toggleBase(baseNumber) {
    gameData.bases[baseNumber - 1] = !gameData.bases[baseNumber - 1];
    updateDisplay();
    saveGameData();
}

// ページ読み込み完了後にスコア編集機能を有効化
document.addEventListener('DOMContentLoaded', function() {
    initDB();
    // 今日の日付を設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('gameDate').value = today;
    
    // イベントリスナー設定
    setupEventListeners();
    updateDisplay();
    updateTeamNames();
    setTimeout(makeScoreEditable, 100);
    setTimeout(updateBattingTeamSelect, 200);
    
    // 初期表示更新
    updateSubstitutionHistory();
    updateGameResultOptions();
    
    // ベースクリックイベント設定
    document.getElementById('base1').addEventListener('click', () => toggleBase(1));
    document.getElementById('base2').addEventListener('click', () => toggleBase(2));
    document.getElementById('base3').addEventListener('click', () => toggleBase(3));
    
    // イニング・表裏変更イベント
    document.getElementById('currentInning').addEventListener('change', function() {
        gameData.currentInning = parseInt(this.value);
        updateDisplay();
    });

    document.getElementById('topBottom').addEventListener('change', function() {
        gameData.isTop = this.value === 'top';
        updateDisplay();
    });
});

let currentEditingAtBatId = null;

function editAtBat(atBatId) {
    console.log("editAtBat called with id: ", atBatId);
    const atBatRecord = gameData.atBatHistory.find(record => record.id === atBatId);
    if (!atBatRecord) {
        showMessage('編集対象の打席記録が見つかりません', 'error');
        console.error("AtBat record not found for editing: ", atBatId);
        return;
    }

    currentEditingAtBatId = atBatId;

    const allPlayers = [...homePlayers, ...awayPlayers];
    const player = allPlayers.find(p => p.id === atBatRecord.playerId);
    const teamName = atBatRecord.battingTeam === 'home' ? gameData.homeTeamName : gameData.awayTeamName;

    document.getElementById('editAtBatInfo').innerHTML = `
        <p><strong>選手:</strong> ${teamName} ${player.number} ${player.name}</p>
        <p><strong>イニング:</strong> ${atBatRecord.inning}回${atBatRecord.isTop ? '表' : '裏'}</p>
    `;

    document.getElementById('editAtBatResult').value = atBatRecord.result;
    document.getElementById('editRunsScored').value = atBatRecord.runs;
    document.getElementById('editAtBatModal').classList.add('visible');
}

function closeEditAtBatModal() {
    document.getElementById('editAtBatModal').classList.remove('visible');
    currentEditingAtBatId = null;
}

function confirmEditAtBat() {
    if (currentEditingAtBatId === null) return;

    const atBatRecord = gameData.atBatHistory.find(record => record.id === currentEditingAtBatId);
    if (!atBatRecord) {
        showMessage('編集対象の打席記録が見つかりません', 'error');
        return;
    }

    const allPlayers = [...homePlayers, ...awayPlayers];
    const player = allPlayers.find(p => p.id === atBatRecord.playerId);

    // 1. 古い記録を元に戻す
    updatePlayerStats(player, atBatRecord.result, atBatRecord.runs, true);
    const oldInningIndex = atBatRecord.inning - 1;
    if (atBatRecord.battingTeam === 'home') {
        gameData.homeScore[oldInningIndex] -= atBatRecord.runs;
    } else {
        gameData.awayScore[oldInningIndex] -= atBatRecord.runs;
    }

    // 2. 新しい値を取得して記録を更新
    const newResult = document.getElementById('editAtBatResult').value;
    const newRuns = parseInt(document.getElementById('editRunsScored').value) || 0;
    
    atBatRecord.result = newResult;
    atBatRecord.runs = newRuns;

    // 3. 新しい記録を反映
    updatePlayerStats(player, newResult, newRuns, false);
    const newInningIndex = atBatRecord.inning - 1;
     if (atBatRecord.battingTeam === 'home') {
        gameData.homeScore[newInningIndex] += newRuns;
    } else {
        gameData.awayScore[newInningIndex] += newRuns;
    }

    // 表示を更新
    updateDisplay();
    updateAtBatHistory();
    updatePlayerStatsDisplay();

    closeEditAtBatModal();
    showMessage('打席記録を更新しました', 'success');
    saveGameData();
}

function deleteAtBat() {
    if (currentEditingAtBatId === null) return;
    
    if (!confirm('この打席記録を削除しますか？この操作は元に戻せません。')) {
        return;
    }

    const atBatIndex = gameData.atBatHistory.findIndex(record => record.id === currentEditingAtBatId);
    if (atBatIndex === -1) {
        showMessage('削除対象の打席記録が見つかりません', 'error');
        return;
    }

    const atBatRecord = gameData.atBatHistory[atBatIndex];
    const allPlayers = [...homePlayers, ...awayPlayers];
    const player = allPlayers.find(p => p.id === atBatRecord.playerId);

    // 統計とスコアを元に戻す
    updatePlayerStats(player, atBatRecord.result, atBatRecord.runs, true);
    const inningIndex = atBatRecord.inning - 1;
    if (atBatRecord.battingTeam === 'home') {
        gameData.homeScore[inningIndex] -= atBatRecord.runs;
    } else {
        gameData.awayScore[inningIndex] -= atBatRecord.runs;
    }

    // 履歴から削除
    gameData.atBatHistory.splice(atBatIndex, 1);

    // 表示を更新
    updateDisplay();
    updateAtBatHistory();
    updatePlayerStatsDisplay();

    closeEditAtBatModal();
    showMessage('打席記録を削除しました', 'success');
    saveGameData();
}

function savePlayerToMaster(teamName, player) {
    if (!db) return;
    const transaction = db.transaction([playerStoreName], "readwrite");
    const store = transaction.objectStore(playerStoreName);
    const request = store.put({ teamName: teamName, ...player });

    request.onerror = function(event) {
        console.error("Error saving player to master: " + event.target.errorCode);
    };
}

function openPlayerMasterModal() {
    const team = document.getElementById('playerTeam').value;
    const teamName = team === 'home' ? gameData.homeTeamName : gameData.awayTeamName;
    
    if (!db) {
        showMessage('データベースが初期化されていません。', 'error');
        return;
    }

    const transaction = db.transaction([playerStoreName], "readonly");
    const store = transaction.objectStore(playerStoreName);
    const index = store.index("teamName");
    const request = index.getAll(teamName);

    request.onsuccess = function(event) {
        const players = event.target.result;
        const listDiv = document.getElementById('playerMasterList');
        listDiv.innerHTML = '';

        if (players.length === 0) {
            listDiv.innerHTML = '<p>このチームの登録選手はいません。</p>';
        } else {
            players.sort((a, b) => a.number - b.number).forEach(player => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'player-master-item';
                playerDiv.innerHTML = `<span>${player.number} ${player.name}</span>`;
                playerDiv.onclick = () => addPlayerFromMaster(player);
                listDiv.appendChild(playerDiv);
            });
        }
        document.getElementById('playerMasterModal').classList.add('visible');
    };

    request.onerror = function(event) {
        showMessage('選手マスタの読み込みに失敗しました。', 'error');
    };
}

function closePlayerMasterModal() {
    document.getElementById('playerMasterModal').classList.remove('visible');
}

function addPlayerFromMaster(player) {
    const team = document.getElementById('playerTeam').value;
    const targetPlayers = team === 'home' ? homePlayers : awayPlayers;

    if (targetPlayers.some(p => p.number === player.number)) {
        showMessage(`背番号 ${player.number} は既に追加されています。`, 'error');
        return;
    }

    const newPlayer = {
        id: Date.now(),
        name: player.name,
        number: player.number,
        position: '', // ポジションは別途設定
        team: team,
        isActive: true,
        stats: {
            atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0,
            walks: 0, strikeouts: 0, rbis: 0
        }
    };

    targetPlayers.push(newPlayer);
    updatePlayersDisplay();
    updateBatterSelect();
    showMessage(`選手 ${player.number} ${player.name} を追加しました。`, 'success');
    closePlayerMasterModal();
    saveGameData();
}

function addSamplePlayers(targetTeam) {
    let playersArray;
    let teamNameDisplay;

    if (targetTeam === 'home') {
        playersArray = homePlayers;
        teamNameDisplay = gameData.homeTeamName;
    } else if (targetTeam === 'away') {
        playersArray = awayPlayers;
        teamNameDisplay = gameData.awayTeamName;
    } else {
        showMessage('無効なチーム指定です。', 'error');
        return;
    }

    playersArray.splice(0, playersArray.length); // 既存の選手をクリア

    for (let i = 1; i <= 9; i++) {
        const player = {
            id: Date.now() + i,
            name: `${teamNameDisplay}選手${i}`,
            number: i,
            position: '',
            team: targetTeam,
            isActive: true,
            stats: {
                atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0,
                walks: 0, strikeouts: 0, rbis: 0
            }
        };
        playersArray.push(player);
    }
    updatePlayersDisplay();
    updateBatterSelect();
    showMessage(`${teamNameDisplay}にサンプル選手9名を追加しました。`, 'success');
    saveGameData();
}

// gameDataをIndexedDBに保存
function saveGameData() {
    if (!db) return;
    const transaction = db.transaction([gameDataStoreName], "readwrite");
    const store = transaction.objectStore(gameDataStoreName);
    
    // gameDataオブジェクトにhomePlayersとawayPlayersを直接含める
    const dataToSave = { 
        ...gameData, 
        homePlayers: homePlayers, 
        awayPlayers: awayPlayers 
    };

    const request = store.put(dataToSave);

    request.onerror = function(event) {
        console.error("Error saving game data: " + event.target.errorCode);
    };
    request.onsuccess = function() {
        console.log("Game data saved.");
    };
}

// gameDataをIndexedDBからロード
function loadGameData() {
    if (!db) return;
    const transaction = db.transaction([gameDataStoreName], "readonly");
    const store = transaction.objectStore(gameDataStoreName);
    const request = store.get("current_game");

    request.onsuccess = function(event) {
        const loadedData = event.target.result;
        if (loadedData) {
            // ロードしたデータをgameDataにマージ
            Object.assign(gameData, loadedData);
            // 選手データも復元
            homePlayers = loadedData.homePlayers || [];
            awayPlayers = loadedData.awayPlayers || [];

            // UIを更新
            updateDisplay();
            updateTeamNames(); // チーム名表示も更新
            updatePlayersDisplay();
            updateBatterSelect();
            updateAtBatHistory();
            updatePlayerStatsDisplay();
            updateSubstitutionHistory();
            showMessage('前回の試合データをロードしました', 'success');
        } else {
            console.log("No saved game data found.");
        }
    };

    request.onerror = function(event) {
        console.error("Error loading game data: " + event.target.errorCode);
    };
}

function resetGame() {
    if (confirm('現在の試合データをすべてリセットしますか？この操作は元に戻せません。')) {
        // gameDataを初期状態に戻す
        gameData = {
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
        homePlayers = [];
        awayPlayers = [];

        // IndexedDBから試合データを削除
        if (db) {
            const transaction = db.transaction([gameDataStoreName], "readwrite");
            const store = transaction.objectStore(gameDataStoreName);
            store.delete("current_game");
            transaction.oncomplete = function() {
                console.log("Game data deleted from IndexedDB.");
                // UIを初期状態に更新
                updateDisplay();
                updateTeamNames();
                updatePlayersDisplay();
                updateBatterSelect();
                updateAtBatHistory();
                updatePlayerStatsDisplay();
                updateSubstitutionHistory();
                showMessage('試合データをリセットしました', 'success');
            };
            transaction.onerror = function(event) {
                console.error("Error deleting game data: " + event.target.errorCode);
                showMessage('試合データのリセットに失敗しました', 'error');
            };
        } else {
            // DBが初期化されていない場合でもUIはリセット
            updateDisplay();
            updateTeamNames();
            updatePlayersDisplay();
            updateBatterSelect();
            updateAtBatHistory();
            updatePlayerStatsDisplay();
            updateSubstitutionHistory();
            showMessage('試合データをリセットしました', 'success');
        }
    }
}