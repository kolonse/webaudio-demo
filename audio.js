// var ws_log_out = new WebSocket("ws://127.0.0.1:8889"); 

// function JinShanLogMessage(type, data) {
//     this.type = type;
//     this.data = data;
// }

// JinShanLogMessage.prototype.format = function() {
//     var result = new Uint8Array(this.data.byteLength + 4 + 4);
//     var len = new Uint8Array(new Uint32Array([this.data.byteLength]).buffer);
//     var type = new Uint8Array(new Uint32Array([this.type]).buffer);

//     result.set(len,0);
//     result.set(type,4);
//     result.set(this.data,8);

//     return result;
// }

// function JinShanSendLog(data) {
//     if (ws_log_out && ws_log_out.readyState === 1) {
//         ws_log_out.send(data);
//     }
// }

// function saveAudio(data) {
//     JinShanSendLog(new JinShanLogMessage(5555, new Uint8Array(data.buffer)).format());
// }

function openDownloadDialog(url, saveName)
{
	if(typeof url == 'object' && url instanceof Blob)
	{
		url = URL.createObjectURL(url); // 创建blob地址
	}
	var aLink = document.createElement('a');
	aLink.href = url;
	aLink.download = saveName || ''; // HTML5新增的属性，指定保存文件名，可以不要后缀，注意，file:///模式下不会生效
	var event;
	if(window.MouseEvent) event = new MouseEvent('click');
	else
	{
		event = document.createEvent('MouseEvents');
		event.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
	}
	aLink.dispatchEvent(event);
}

class wokletNode extends AudioWorkletNode {
    constructor(context) {
        super(context, 'myworklet');
        console.log(context);
        this.port.onmessage = this.handleMessage.bind(this);
        this.count              = 0;
        this.sampleRate         = context.sampleRate;
        
        this.step               = context.sampleRate / 100 ;
        this.times              = 100 * 30;

        this.audioBuff          = new Float32Array( this.step * this.times );
        this.writeLen           = 0;

        this.seq                = 0;
        this.fileName           = new Date().getTime();
    }

    handleMessage(event) {
        let data = event.data;
        // saveAudio(data);
        this.audioBuff.set(data, this.writeLen);
        this.writeLen += data.length;
        if (this.writeLen >= this.audioBuff.length) {
            let blob = new Blob([ this.audioBuff.buffer ], {type : "application/octet-stream"});
            openDownloadDialog(blob, "" + this.fileName + "_" + ".float32." + this.sampleRate + "." + this.seq + ".pcm")
            this.writeLen = 0;
            this.seq ++ ;
        }

        this.count ++;

        // if (this.isZeroData(data)) {
        //     log(new Date(), "@ " + (this.count * 10 / 1000) + " s", " happen zero data" );
        // }

        this.checkZeroData(data,(t) =>{
            log(new Date(), "@ " + (this.count * 10 / 1000) + " s", " happen zero data, length :", t );
        });
    }

    isZeroData(data) {
        let flag = true;
        for (let i = 0;i < data.length;i ++) {
            if (data[i] !== 0) {
                flag = false;
                break;
            }
        }

        return flag;
    }

    checkZeroData(data,cb) {
        let count = 0;
        for (let i = 0;i < data.length; i ++) {
            if (data[i] == 0) {
                count ++ ;
            } else {
                if (count != 0) {
                    cb (count);
                }
                count = 0;
            }
        }

        if (count !== 0) {
            cb (count);
        }
    }
}

class AudioTest {
    constructor(cb) {
        this.audioContext       = null;//new AudioContext();
        this.audioScirptNode    = null;//this.audioContext.createScriptProcessor(256, 1, 1);
        this.audioStreamNode    = null;
        this.onTextUpdate       = cb;
        this.beginTime          = 0;
        this.sampleRate         = 16000;
        this.ringBuffer         = new RingBuffer( this.sampleRate * 10 /1000 );
        this.count              = 0;
        this.audioWorkletNode   = null;

    }

    start() {
        navigator.mediaDevices.getUserMedia( {audio : true} )
            .then(this.createAudioContext.bind(this))
            // .then(this.createStriptNode.bind(this))
            // .then(this.connectNode.bind(this));

            .then(this.createWorkletNode.bind(this))
            .then(this.connectWorkletNode.bind(this));
    }

    createAudioContext(stream) {
        this.audioContext = new AudioContext({
            sampleRate : this.sampleRate,
        });
        this.audioStreamNode = this.audioContext.createMediaStreamSource(stream);
        console.log("createAudioContext", this.audioStreamNode);
        return new Promise((resolve) =>{resolve();});
    }

    createWorkletNode () {
        let that = this;
        return this.audioContext.audioWorklet.addModule("worklet.js")
            .then(()=>{
                that.audioWorkletNode = new wokletNode(that.audioContext);
                return new Promise((resolve) =>{resolve();});
            });
    }

    connectWorkletNode() {
        this.audioStreamNode.connect(this.audioWorkletNode);
        this.audioWorkletNode.connect(this.audioContext.destination);

        this.onTextUpdate("\n")
        this.onTextUpdate(new Date(), "start record");
        this.beginTime = new Date().getTime();
    }

    createStriptNode () {
        this.audioScirptNode = this.audioContext.createScriptProcessor(256, 1, 1);
        this.audioScirptNode.onaudioprocess = this.onPCMAudioDataProcess.bind(this);
        return new Promise((resolve) =>{resolve();});
    }

    connectNode() {
        this.audioStreamNode.connect(this.audioScirptNode);
        this.audioScirptNode.connect(this.audioContext.destination);

        this.onTextUpdate("\n")
        this.onTextUpdate(new Date(), "start record");
        this.beginTime = new Date().getTime();
    }

    onPCMAudioDataProcess(ev) {
        let data = ev.inputBuffer.getChannelData(0);
        this.ringBuffer.append(data);
        for (let i = 0;i < ev.outputBuffer.numberOfChannels;i ++) {
            let out = ev.outputBuffer.getChannelData(i);
            out.set(data);
        }

        let sub = null;
        while ( ( sub = this.ringBuffer.readAsFloat32() ) != null ) {
            this.count ++;
            if (this.isZeroData(sub)) {
                this.onTextUpdate(new Date(), "@ " + (this.count * 10 / 1000) + " s", " happen zero data" );
            }
        }
    }

    isZeroData(data) {
        let flag = true;
        for (let i = 0;i < data.length;i ++) {
            if (data[i] !== 0) {
                flag = false;
                break;
            }
        }

        return flag;
    }
}

function formatStr() {
    let str = "";
    for (let i = 0;i < arguments.length;i ++) {
        str += arguments[i];
    }
    str += "\n"
    return str;
}


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

function log() {
    text.value = text.value + formatStr.apply(null, arguments);
}

var text = document.getElementById("text");
new AudioTest(log).start();
