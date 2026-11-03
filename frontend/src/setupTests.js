import '@testing-library/jest-dom';

if (typeof HTMLCanvasElement !== 'undefined') {
  const canvasContextMock = new Proxy({
    canvas: {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    createRadialGradient: () => ({
      addColorStop: () => {},
    }),
    setLineDash: () => {},
    getLineDash: () => [],
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
    set() {
      return true;
    },
  });

  HTMLCanvasElement.prototype.getContext = () => canvasContextMock;
}

if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }
}
