import Turbo from './gl2c'
import searchInit, {transform} from './searchInit'
import {k_init, headers, twistMain, barrier, twist, k_transform, increment, k_check} from './kernel'

let HASH_LENGTH = 243,
  STATE_LENGTH = HASH_LENGTH * 3,
  TRANSACTION_LENGTH = HASH_LENGTH * 33;
let MAXIMAGESIZE = 1e6;
let dim = {};
let texelSize = 4;

dim.x = STATE_LENGTH+1;
//dim.x = STATE_LENGTH;
let imageSize= Math.floor(MAXIMAGESIZE / dim.x / texelSize ) * dim.x * texelSize;
dim.y = imageSize / dim.x / texelSize ;

var pack = (l) => (r,k,i) => (i%l ===0 ? r.push([k]): r[r.length-1].push(k)) && r;

export default class {
  constructor() {
    if(Turbo) {
      this.buf = Turbo.alloc(imageSize);
      this.turbo = new Turbo(dim);
      this.state = "READY";
      this.findNonce = this._turboFindNonce;
    }
  }

  search(transactionTrits, minWeightMagnitude) {
    return new Promise((res, rej) => {
      if (transactionTrits.length != TRANSACTION_LENGTH) rej(new Error("Incorrect Transaction Length"));
      else if(minWeightMagnitude >= HASH_LENGTH || minWeightMagnitude <= 0) rej(new Error("Incorrect Min-Weight Magnitude"));
      else {
        var states = {
          low : new Int32Array(STATE_LENGTH),
          high : new Int32Array(STATE_LENGTH)
        };
        searchInit(states, transactionTrits);
        this.findNonce(states, minWeightMagnitude, (hash) => res(hash));
      }
    });
  }

  _turboFindNonce(states, minWeightMagnitude, callback) {
    this._turboWriteBuffers(states);
    this.mwm = minWeightMagnitude;
    this.cb = callback;

    this.turbo.run(this.buf, dim, k_init, true);

    this._turboOffset();
    requestAnimationFrame(() => {this._turboSearch(callback)});
  }

  _turboSearch(callback) {
    for(var i = 0; i < dim.y; i++) {
      this._turboIncrement(HASH_LENGTH /3 * 2, HASH_LENGTH, i);
    }
    this._turboTransform();
    var {index, nonce} = this._turboCheck();
    if(index === -1) {
      console.log("next");
      requestAnimationFrame(() => {this._turboSearch(callback)});
    } else {
      console.log("wahoo");
      var length = dim.x*texelSize;
      var start = length*index;
      var end = start + HASH_LENGTH*texelSize;
      console.log(index);
      console.log("nonce: " + nonce);
      callback(
        this.buf.data
        .reduce(pack(4), []).reduce(pack(dim.x), [])[index]
        .slice(0,HASH_LENGTH)
        .map( x => (x[0] & nonce == 0) ? 1 : ( (x[1] & nonce) == 0 ? -1 : 0))
      );
    }
  }

  _turboCheck() {
    var length = (STATE_LENGTH + 1) * texelSize ;
    var index = -1, nonce;
    this.buf.data[length-1] = this.mwm;
    this.turbo.run(this.buf, dim, headers + k_check);

    for(var i = 0; i < dim.y; i++) {
      nonce = this._slowCheck(length, i);
      if(nonce != 0) {
        index = i;
        return {index, nonce};
      }
    }
    return {index, nonce};
  }

  _slowCheck(len, y) {
    var lastMeasurement = 0xFFFFFFFF;
    for (var i = this.mwm; i-- > 0; ) {
      lastMeasurement &= ~(
        this.buf.data[len*y + (HASH_LENGTH - 1 - i) * texelSize + 2] ^
        this.buf.data[len*y + (HASH_LENGTH - 1 - i) * texelSize + 3]);
      if (lastMeasurement == 0) {
        return 0;
      }
    }
    return lastMeasurement;
  }

  _turboOffset() {
    for(var i = 1; i < dim.y; i++) {
      //console.log("offset at: " +i);
      for(var j = i; j < dim.y; j++) {
        this._turboIncrement(HASH_LENGTH/3, (HASH_LENGTH / 3)* 2, j);
      }
    }
  }

  _turboIncrement(from, to, row) {
    for(var i = from; i < to; i++) {
      if (this.buf.data[(i + row)* texelSize] == 0) {
        this.buf.data[(i + row)* texelSize] = 0xFFFFFFFF;
        this.buf.data[(i + row)* texelSize + 1] = 0;
      }
      else {
        if (this.buf.data[(i + row)* texelSize + 1] == 0) {
          this.buf.data[(i + row)* texelSize + 1] = 0xFFFFFFFF;
        }
        else {
          this.buf.data[(i + row)* texelSize] = 0;
        }
        break;
      }
    }
    //this.turbo.run(this.buf, dim, headers + increment);
  }
  _turboTransform() {
    //this.turbo.run(this.buf, dim, headers + barrier + twist + twistMain, false);
    for(var i = 0; i < 27; i++) {
      this.turbo.run(this.buf, dim, headers + barrier + twist + twistMain, true);
    }
  }

  _turboWriteBuffers(states) {
    for(var i = 0; i < STATE_LENGTH; i++) {
      this.buf.data[i * texelSize] = states.low[i];
      this.buf.data[i * texelSize + 1] = states.high[i];
      this.buf.data[i * texelSize + 2] = states.low[i];
      this.buf.data[i * texelSize + 3] = states.high[i];
    }
  }
}
    /*
    console.log(this.buf.data.reduce(pack(4), []).reduce(pack(dim.x), [])[0][0]);
    console.log(this.buf.data.reduce(pack(4), []).reduce(pack(dim.x), [])[0][0]);
    return;

    this.turbo.run(this.buf, dim, headers + barrier + twistMain);
    transform(states);
    console.log(states.low.slice(720,728));
    */
    //this.turbo.run(this.buf, dim, k_init, false);
    //return this._slowCheck() === 0;
    /*
    return this.buf.data[(1 + STATE_LENGTH) * texelSize] == 0;
    */
