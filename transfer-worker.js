importScripts('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js');

let currentFileId = null;
let processedChunks = new Map();
let isPaused = false;  // 新增变量，控制是否暂停接收

self.onmessage = async function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'compress':
            const { chunks, workerId, channelId } = e.data;
            await processChunks(chunks, workerId, channelId);
            break;

        case 'processChunk':
            if (!isPaused) {
                await handleReceivedChunk(data);
            }
            break;

        case 'pause':  // 新增暂停处理
            isPaused = true;
            console.log('接收暂停');
            break;

        case 'resume':  // 新增恢复处理
            isPaused = false;
            console.log('接收恢复');
            break;
    }
};

async function processChunks(chunks, workerId, channelId) {
    for (const chunk of chunks) {
        if (isPaused) {
            break;  // 如果处于暂停状态，停止处理后续的分片
        }

        const compressed = pako.deflate(new Uint8Array(chunk));
        
        // 创建二进制消息
        const message = new ArrayBuffer(compressed.length + 8);
        const view = new DataView(message);
        
        // 添加元数据头
        view.setUint32(0, workerId);
        view.setUint32(4, compressed.length);
        
        // 添加压缩数据
        new Uint8Array(message, 8).set(compressed);
        
        // 发送给主线程
        self.postMessage({
            type: 'sendChunk',
            channelId: channelId,
            data: message
        }, [message]);
    }
}

async function handleReceivedChunk(data) {
    const view = new DataView(data);
    const workerId = view.getUint32(0);
    const compressedLength = view.getUint32(4);
    
    // 提取压缩数据
    const compressedData = new Uint8Array(data, 8, compressedLength);
    
    // 解压数据
    const decompressed = pako.inflate(compressedData);
    
    // 发送回主线程
    self.postMessage({
        type: 'chunkProcessed',
        workerId: workerId,
        data: decompressed.buffer
    }, [decompressed.buffer]);
}
