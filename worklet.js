function RingBuffer(frameSize) {
    this.block = new Float32Array(frameSize);
    this.frameSize = frameSize;
    this.blockSize = 0;
    this.queue = [];
}

RingBuffer.prototype.read_some = function() {
    if (this.queue.length === 0) {
        return null;
    }
    var buff = this.queue.shift();
    return new Uint8Array(buff.buffer);
}

RingBuffer.prototype.readAsFloat32 = function() {
    if (this.queue.length === 0) {
        return null;
    }
    return this.queue.shift();
}

RingBuffer.prototype.append = function(buff){
    while( (buff = this._append (buff)) !== null ) {}
}

RingBuffer.prototype._append = function(buff){
    if (this.blockSize + buff.length < this.block.length) {
        this.block.set(buff, this.blockSize);
        this.blockSize += buff.length;
        return null;
    } else if (this.blockSize + buff.length === this.block.length) {
        this.block.set(buff, this.blockSize);
        this.queue.push(this.block);
        this.block = new Float32Array(this.frameSize);
        this.blockSize = 0;
        return null;
    }else {
        let remain = this.block.length - this.blockSize;
        this.block.set(buff.subarray(0, remain), this.blockSize, this.block.length);
        this.queue.push(this.block);
        this.block = new Float32Array(this.frameSize);
        this.blockSize = 0;
        return buff.subarray(remain);
    }
}

RingBuffer.prototype.clear = function () {

};

RingBuffer.prototype.capacity = function () {

};

RingBuffer.prototype.size = function () {
    return this.queue.length;
};

RingBuffer.prototype.available = function () {

};

class myworklet extends AudioWorkletProcessor {
    constructor() {
        // The super constructor call is required.
        super();
        this.port.onmessage = this.handleMessage.bind(this);
        this.ringBuffer = new RingBuffer( sampleRate * 10 / 1000 );
    }

    handleMessage(event) {
    }

    process(inputs, outputs, parameters) {
        for (let i = 0;i < outputs.length;i ++) {
            for (let j = 0;j < outputs[i].length;j ++) {
                outputs[i][j].set(inputs[0][0]);
            }
        }

        this.ringBuffer.append(inputs[0][0]);
        let data = null;
        while ( ( data = this.ringBuffer.readAsFloat32() ) != null ) {
            this.port.postMessage(data);
        }
        return true;
    }
}

registerProcessor('myworklet', myworklet);