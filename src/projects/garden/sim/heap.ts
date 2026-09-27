/** Min-heap of timed callbacks: the sim's own clock, never setTimeout. */
export class Heap {
  private a: { at: number; seq: number; fn: () => void }[] = [];
  private seq = 0;
  get size() {
    return this.a.length;
  }
  peekAt() {
    return this.a[0]?.at ?? Infinity;
  }
  private less(i: number, j: number) {
    const x = this.a[i], y = this.a[j];
    return x.at < y.at || (x.at === y.at && x.seq < y.seq);
  }
  push(at: number, fn: () => void) {
    const a = this.a;
    a.push({ at, seq: this.seq++, fn });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): () => void {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.fn;
  }
}
