// Ring buffer of active ripples, mirrored into the water shader's uniform array.
export class Ripples {
  constructor(uniformArray, timeRef) {
    this.slots = uniformArray; // THREE.Vector4[]: x, z, startTime, strength
    this.next = 0;
    this.timeRef = timeRef;
  }

  add(x, z, strength = 1) {
    const v = this.slots[this.next];
    v.set(x, z, this.timeRef.value, strength);
    this.next = (this.next + 1) % this.slots.length;
  }
}
