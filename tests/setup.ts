/**
 * Global test setup.
 * Provides a minimal Web Audio API mock for jsdom, which does not
 * implement the Web Audio API natively.
 */

class MockAudioParam {
  value = 0;
  setTargetAtTime(target: number, _startTime: number, _timeConstant: number) {
    this.value = target;
  }
}

class MockAudioNode {
  /** Nodes this one is connected to, so tests can check the wiring. */
  connections: unknown[] = [];
  connect(dest: unknown) { this.connections.push(dest); return dest as MockAudioNode; }
  disconnect() { this.connections = []; }
}

class MockConvolverNode extends MockAudioNode {
  buffer: unknown = null;
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockPannerNode extends MockAudioNode {
  positionX = new MockAudioParam();
  positionY = new MockAudioParam();
  positionZ = new MockAudioParam();
  panningModel = 'HRTF';
  distanceModel = 'inverse';
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  coneOuterGain = 0;
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  playbackRate = new MockAudioParam();
  onended: (() => void) | null = null;
  start(_offset?: number, _when?: number) {}
  stop() { this.onended?.(); }
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = new MockAudioNode();

  listener = {
    positionX: new MockAudioParam(),
    positionY: new MockAudioParam(),
    positionZ: new MockAudioParam(),
    forwardX: new MockAudioParam(),
    forwardY: new MockAudioParam(),
    forwardZ: new MockAudioParam(),
    upX: new MockAudioParam(),
    upY: new MockAudioParam(),
    upZ: new MockAudioParam(),
  };

  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { return Promise.resolve(); }

  createGain() { return new MockGainNode(); }

  createBufferSource() { return new MockAudioBufferSourceNode(); }

  createConvolver() { return new MockConvolverNode(); }

  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, getChannelData: (ch: number) => data[ch] };
  }

  decodeAudioData(_buf: ArrayBuffer) {
    return Promise.resolve({} as AudioBuffer);
  }
}

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: MockAudioContext,
});

Object.defineProperty(window, 'PannerNode', {
  writable: true,
  value: MockPannerNode,
});
