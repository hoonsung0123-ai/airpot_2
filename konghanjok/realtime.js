// 실시간 매칭 시스템 (localStorage polling 방식)
// 같은 브라우저의 다른 탭과 실시간 통신 - 모든 환경에서 작동

const RealtimeMatch = {
  myId: null,
  myData: null,
  roomId: null,
  isHost: false,
  pollInterval: null,
  onMatchFound: null,
  onOpponentChoice: null,
  onOpponentLeft: null,
  _processedChoices: new Set(),
  _lastRoundKey: null,

  // 초기화
  init: function() {
    this.myId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    this._processedChoices = new Set();
    
    // 페이지 떠날 때 정리
    window.addEventListener('beforeunload', () => {
      this.leave();
    });

    console.log('[RealtimeMatch] 초기화됨:', this.myId);
    return this;
  },

  // localStorage 키
  QUEUE_KEY: 'konghanjok_queue',
  ROOMS_KEY: 'konghanjok_rooms',

  // 대기열 가져오기
  getQueue: function() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY)) || [];
    } catch(e) {
      return [];
    }
  },

  // 대기열 저장
  setQueue: function(queue) {
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
  },

  // 방 정보 가져오기
  getRoom: function(roomId) {
    try {
      const rooms = JSON.parse(localStorage.getItem(this.ROOMS_KEY)) || {};
      return rooms[roomId];
    } catch(e) {
      return null;
    }
  },

  // 방 정보 저장
  setRoom: function(roomId, data) {
    try {
      const rooms = JSON.parse(localStorage.getItem(this.ROOMS_KEY)) || {};
      rooms[roomId] = data;
      localStorage.setItem(this.ROOMS_KEY, JSON.stringify(rooms));
    } catch(e) {
      console.error('[RealtimeMatch] 방 저장 오류:', e);
    }
  },

  // 매칭 시작
  findMatch: function(matchData) {
    this.myData = matchData;
    console.log('[RealtimeMatch] 매칭 시작:', matchData);
    
    // 오래된 데이터 정리
    this.cleanupOldData();
    
    // 대기열에 등록
    const queue = this.getQueue();
    const now = Date.now();
    
    // 오래된 항목 제거 (60초 이상)
    const freshQueue = queue.filter(p => now - p.timestamp < 60000 && p.playerId !== this.myId);
    
    // 내 정보 추가
    const myEntry = {
      playerId: this.myId,
      model: matchData.model,
      mySide: matchData.mySide,
      needSide: matchData.needSide,
      condition: matchData.condition,
      timestamp: now,
      roomId: null
    };
    
    freshQueue.push(myEntry);
    this.setQueue(freshQueue);
    
    console.log('[RealtimeMatch] 대기열 등록됨. 현재 대기열:', freshQueue.length, '명');
    
    // 매칭 상대 찾기 시작
    this.startPolling();
  },

  // 오래된 데이터 정리
  cleanupOldData: function() {
    const now = Date.now();
    
    // 오래된 방 정리
    try {
      const rooms = JSON.parse(localStorage.getItem(this.ROOMS_KEY)) || {};
      const freshRooms = {};
      for (const [id, room] of Object.entries(rooms)) {
        if (now - room.createdAt < 300000) { // 5분 이내
          freshRooms[id] = room;
        }
      }
      localStorage.setItem(this.ROOMS_KEY, JSON.stringify(freshRooms));
    } catch(e) {}
  },

  // 폴링 시작
  startPolling: function() {
    // 기존 인터벌 정리
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    
    // 즉시 한번 체크
    this.checkForMatch();
    
    // 300ms마다 체크 (더 빠른 반응)
    this.pollInterval = setInterval(() => {
      if (this.roomId) {
        this.checkRoomStatus();
      } else {
        this.checkForMatch();
      }
    }, 300);
  },

  // 매칭 상대 찾기
  checkForMatch: function() {
    if (this.roomId) return;
    
    const queue = this.getQueue();
    const now = Date.now();
    
    // 내 항목 찾기
    let myEntry = queue.find(p => p.playerId === this.myId);
    
    if (!myEntry) {
      // 내가 대기열에 없으면 다시 등록
      console.log('[RealtimeMatch] 대기열에서 내 항목 없음, 재등록');
      if (this.myData) {
        const freshQueue = queue.filter(p => now - p.timestamp < 60000);
        freshQueue.push({
          playerId: this.myId,
          model: this.myData.model,
          mySide: this.myData.mySide,
          needSide: this.myData.needSide,
          condition: this.myData.condition,
          timestamp: now,
          roomId: null
        });
        this.setQueue(freshQueue);
      }
      return;
    }
    
    // 이미 방에 배정됐는지 확인
    if (myEntry.roomId) {
      console.log('[RealtimeMatch] 방 배정됨:', myEntry.roomId);
      this.roomId = myEntry.roomId;
      this.isHost = myEntry.isHost;
      if (this.onMatchFound) {
        this.onMatchFound(this.roomId, this.isHost, myEntry.opponentData);
      }
      return;
    }
    
    // 매칭 가능한 상대 찾기
    const opponent = queue.find(p => 
      p.playerId !== this.myId &&
      !p.roomId &&
      p.model === this.myData.model &&
      p.mySide === this.myData.needSide &&
      p.needSide === this.myData.mySide &&
      now - p.timestamp < 60000
    );
    
    if (opponent) {
      console.log('[RealtimeMatch] 상대 발견!', opponent.playerId);
      this.createRoom(opponent);
    }
  },

  // 방 생성
  createRoom: function(opponent) {
    if (this.roomId) return;
    
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    this.roomId = roomId;
    this.isHost = true;
    
    console.log('[RealtimeMatch] 방 생성:', roomId);
    
    // 방 정보 저장
    this.setRoom(roomId, {
      hostId: this.myId,
      guestId: opponent.playerId,
      hostChoice: null,
      guestChoice: null,
      round: 1,
      status: 'playing',
      createdAt: Date.now()
    });
    
    // 대기열 업데이트 (양쪽 다 방 배정)
    const queue = this.getQueue();
    const updatedQueue = queue.map(p => {
      if (p.playerId === this.myId) {
        return { ...p, roomId: roomId, isHost: true, opponentData: opponent };
      }
      if (p.playerId === opponent.playerId) {
        return { ...p, roomId: roomId, isHost: false, opponentData: this.myData };
      }
      return p;
    });
    this.setQueue(updatedQueue);
    
    if (this.onMatchFound) {
      this.onMatchFound(roomId, true, opponent);
    }
  },

  // 방 참가
  joinRoom: function(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;
    this._processedChoices = new Set();
    console.log('[RealtimeMatch] 방 참가:', roomId, '호스트:', isHost);
    this.startPolling();
  },

  // 방 상태 확인
  checkRoomStatus: function() {
    const room = this.getRoom(this.roomId);
    if (!room) return;
    
    // 상대가 선택했는지 확인
    const opponentChoice = this.isHost ? room.guestChoice : room.hostChoice;
    const roundKey = this.roomId + '_' + room.round + '_' + opponentChoice;
    
    if (opponentChoice && !this._processedChoices.has(roundKey)) {
      console.log('[RealtimeMatch] 상대 선택 감지:', opponentChoice, 'round:', room.round);
      this._processedChoices.add(roundKey);
      if (this.onOpponentChoice) {
        this.onOpponentChoice(opponentChoice);
      }
    }
    
    // 상대가 나갔는지 확인
    if (room.status === 'abandoned' && this.onOpponentLeft) {
      this.onOpponentLeft();
    }
  },

  // 선택 전송
  sendChoice: function(choice) {
    const room = this.getRoom(this.roomId);
    if (!room) {
      console.error('[RealtimeMatch] 방 정보 없음');
      return;
    }
    
    console.log('[RealtimeMatch] 선택 전송:', choice, '호스트:', this.isHost);
    
    if (this.isHost) {
      room.hostChoice = choice;
    } else {
      room.guestChoice = choice;
    }
    
    this.setRoom(this.roomId, room);
  },

  // 라운드 리셋
  resetRound: function() {
    const room = this.getRoom(this.roomId);
    if (!room) return;
    
    room.hostChoice = null;
    room.guestChoice = null;
    room.round = (room.round || 1) + 1;
    
    this.setRoom(this.roomId, room);
    console.log('[RealtimeMatch] 라운드 리셋, 다음 라운드:', room.round);
  },

  // 나가기
  leave: function() {
    console.log('[RealtimeMatch] 나가기');
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    // 대기열에서 제거
    const queue = this.getQueue();
    const newQueue = queue.filter(p => p.playerId !== this.myId);
    this.setQueue(newQueue);
    
    // 방 상태 업데이트
    if (this.roomId) {
      const room = this.getRoom(this.roomId);
      if (room) {
        room.status = 'abandoned';
        this.setRoom(this.roomId, room);
      }
    }
  },

  // 대기열 초기화 (디버깅용)
  clearAll: function() {
    localStorage.removeItem(this.QUEUE_KEY);
    localStorage.removeItem(this.ROOMS_KEY);
    console.log('[RealtimeMatch] 모든 데이터 초기화됨');
  }
};
