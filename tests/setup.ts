/**
 * Global test setup.
 * Provides a minimal Web Audio API mock for jsdom, which does not
 * implement the Web Audio API natively.
 */

class MockAudioParam {
  value = 0;
}

class MockAudioNode {
  connect(_dest: unknown) { return _dest as MockAudioNode; }
  disconnect() {}
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
  coneOuterAngle = 0;
  coneOuterGain = 0;
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  start(_offset?: number, _when?: number) {}
  stop() { this.onended?.(); }
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
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
