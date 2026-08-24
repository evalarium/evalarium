export interface SeededGenerator {
  next(): number;
  fill(target: Uint8Array): void;
}

export const createSeededGenerator = (seed: number): SeededGenerator => {
  let state = seed >>> 0;

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };

  return Object.freeze({
    next(): number {
      return nextUint32() / 4_294_967_296;
    },
    fill(target: Uint8Array): void {
      let randomWord = 0;
      for (let index = 0; index < target.byteLength; index += 1) {
        if (index % 4 === 0) {
          randomWord = nextUint32();
        }
        target[index] = (randomWord >>> ((index % 4) * 8)) & 0xff;
      }
    },
  });
};
