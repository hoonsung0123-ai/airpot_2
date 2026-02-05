// 실시간 매칭 시스템 (BroadcastChannel API 사용)
// 같은 브라우저의 다른 탭과 실시간 통신

const RealtimeMatch = {
  channel: null,
  myId: null,
  myData: null,
  roomId: null,
  isHost: false,
  onMatchFound: null,
  onOpponentChoice: null,
  onOpponentLeft: null,

  // 초기화
  init: function() {
    this.myId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    this.channel = new BroadcastChannel('konghanjok_match');
    
    this.channel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // 페이지 떠날 때 정리
    window.addEventListener('beforeunload', () => {
      this.leave();
    });

    return this;
  },

  // 메시지 처리
  handleMessage: function(data) {
    switch(data.type) {
      case 'looking_for_match':
        // 다른 플레이어가 매칭 찾는 중
        if (this.myData && !this.roomId && data.playerId !== this.myId) {
          // 매칭 조건 확인 (같은 모델, 반대 방향)
          if (data.model === this.myData.model && 
              data.mySide === this.myData.needSide &&
              data.needSide === this.myData.mySide) {
            // 매칭 성공! 방 생성
            this.createRoom(data);
          }
        }
        break;

      case 'room_created':
        // 방이 생성됨 (내가 초대받음)
        if (data.guestId === this.myId) {
          this.roomId = data.roomId;
          this.isHost = false;
          if (this.onMatchFound) {
            this.onMatchFound(data.roomId, false, data.hostData);
          }
        }
        break;

      case 'player_choice':
        // 상대가 선택함
        if (data.roomId === this.roomId && data.playerId !== this.myId) {
          if (this.onOpponentChoice) {
            this.onOpponentChoice(data.choice);
          }
        }
        break;

      case 'round_reset':
        // 다음 라운드
        if (data.roomId === this.roomId) {
          if (this.onRoundReset) {
            this.onRoundReset();
          }
        }
        break;

      case 'player_left':
        // 상대가 나감
        if (data.roomId === this.roomId && data.playerId !== this.myId) {
          if (this.onOpponentLeft) {
            this.onOpponentLeft();
          }
        }
        break;
    }
  },

  // 매칭 시작
  findMatch: function(matchData) {
    this.myData = matchData;
    
    // 다른 탭에게 매칭 찾는다고 알림
    this.channel.postMessage({
      type: 'looking_for_match',
      playerId: this.myId,
      model: matchData.model,
      mySide: matchData.mySide,
      needSide: matchData.needSide,
      condition: matchData.condition
    });

    // 주기적으로 매칭 요청 (다른 탭이 나중에 열릴 수 있으므로)
    this.matchInterval = setInterval(() => {
      if (!this.roomId) {
        this.channel.postMessage({
          type: 'looking_for_match',
          playerId: this.myId,
          model: matchData.model,
          mySide: matchData.mySide,
          needSide: matchData.needSide,
          condition: matchData.condition
        });
      } else {
        clearInterval(this.matchInterval);
      }
    }, 1000);
  },

  // 방 생성 (호스트)
  createRoom: function(guestData) {
    if (this.roomId) return; // 이미 방에 있음
    
    this.roomId = 'room_' + Date.now();
    this.isHost = true;

    // 게스트에게 방 정보 전송
    this.channel.postMessage({
      type: 'room_created',
      roomId: this.roomId,
      hostId: this.myId,
      guestId: guestData.playerId,
      hostData: this.myData,
      guestData: guestData
    });

    if (this.onMatchFound) {
      this.onMatchFound(this.roomId, true, guestData);
    }

    clearInterval(this.matchInterval);
  },

  // 방 참가 (URL 파라미터로)
  joinRoom: function(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;
  },

  // 선택 전송
  sendChoice: function(choice) {
    this.channel.postMessage({
      type: 'player_choice',
      roomId: this.roomId,
      playerId: this.myId,
      choice: choice
    });
  },

  // 라운드 리셋 알림
  resetRound: function() {
    this.channel.postMessage({
      type: 'round_reset',
      roomId: this.roomId
    });
  },

  // 나가기
  leave: function() {
    if (this.roomId) {
      this.channel.postMessage({
        type: 'player_left',
        roomId: this.roomId,
        playerId: this.myId
      });
    }
    if (this.matchInterval) {
      clearInterval(this.matchInterval);
    }
  }
};
