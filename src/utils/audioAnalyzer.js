export class AudioAnalyzer {
  constructor(stream, onSpeakingStateChange) {
    this.stream = stream;
    this.onSpeakingStateChange = onSpeakingStateChange;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();

    // Configure analyser
    this.analyser.minDecibels = -70;
    this.analyser.maxDecibels = -10;
    this.analyser.smoothingTimeConstant = 0.85;

    // Connect stream to analyser
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.isSpeaking = false;
    this.animationFrameId = null;
    this.lastSpeakingTime = 0;

    // A threshold value that can be adjusted. 
    // Average volume above this number means speaking.
    this.threshold = 15;
  }

  start() {
    const checkAudioLevel = () => {
      this.analyser.getByteFrequencyData(this.dataArray);

      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const average = sum / this.dataArray.length;

      const currentlySpeaking = average > this.threshold;
      const now = Date.now();

      if (currentlySpeaking) {
        this.lastSpeakingTime = now;
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.onSpeakingStateChange(true);
        }
      } else {
        // 500ms delay before considering the user has stopped speaking
        if (this.isSpeaking && (now - this.lastSpeakingTime > 500)) {
          this.isSpeaking = false;
          this.onSpeakingStateChange(false);
        }
      }

      this.animationFrameId = requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}
