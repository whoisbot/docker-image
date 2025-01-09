const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const https = require('https');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// 读取 SSL 证书
const privateKey = fs.readFileSync('private.key', 'utf8');
const certificate = fs.readFileSync('certificate.crt', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// 中间件
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 创建 HTTPS 服务器
const httpsServer = https.createServer(credentials, app);

// WebSocket 服务器（在 https 服务器上运行）
const wss = new WebSocket.Server({
    server: httpsServer,
    perMessageDeflate: false,
    maxPayload: 20 * 1024 * 1024
});

// 存储客户端连接
const clients = new Map();

// 广播设备列表
function broadcastDeviceList() {
    const deviceList = Array.from(clients.entries()).map(([deviceId, client]) => ({
        deviceId: deviceId,
        info: client.deviceInfo
    }));

    const message = JSON.stringify({
        type: 'deviceList',
        devices: deviceList
    });

    console.log('广播设备列表:', deviceList);
    
    // 向所有连接的客户端广播设备列表
    for (const client of clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
            console.log(`广播消息到设备 ${client.deviceInfo.name}`);
            client.ws.send(message);
        }
    }
}

// 处理 WebSocket 连接
wss.on('connection', (ws) => {
    console.log('新客户端连接');
    console.log('WebSocket 连接信息:', ws);

    // 处理二进制消息
    function handleBinaryMessage(data) {
        try {
            // 解析头信息
            const headerSize = data.readUInt32LE(0);
            const headerData = data.slice(4, 4 + headerSize);
            const header = JSON.parse(headerData.toString());

            // 转发给目标设备
            const targetClient = clients.get(header.to);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                // 直接转发原始二进制数据
                targetClient.ws.send(data, { binary: true });
            } else {
                console.log('目标设备不存在或未连接:', header.to);
            }
        } catch (error) {
            console.error('处理二进制消息失败:', error);
        }
    }

    // 处理文本消息
    function handleTextMessage(message) {
        console.log('处理文本消息:', message);
        
        switch (message.type) {
            case 'register':
                // 注册设备
                console.log('注册设备:', message.deviceId);
                clients.set(message.deviceId, {
                    ws: ws,
                    deviceInfo: message.deviceInfo
                });
                // 广播设备列表
                broadcastDeviceList();
                break;

            case 'message':
                // 转发消息到目标设备
                console.log('转发消息:', message);
                const targetClient = clients.get(message.to);
                if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                    console.log('转发消息到:', message.to);
                    targetClient.ws.send(JSON.stringify(message));
                } else {
                    console.log('目标设备不存在或未连接:', message.to);
                }
                break;

            default:
                console.log('未知消息类型:', message.type);
        }
    }

    // 处理消息
    ws.on('message', (data) => {
        try {
            // 如果是字符串，直接作为JSON处理
            if (typeof data === 'string') {
                const message = JSON.parse(data);
                handleTextMessage(message);
                return;
            }

            // 尝试解析为JSON
            try {
                const message = JSON.parse(data.toString());
                handleTextMessage(message);
            } catch {
                // 如果解析JSON失败，则作为二进制消息处理
                handleBinaryMessage(data);
            }
        } catch (error) {
            console.error('处理消息时出错:', error);
        }
    });

    // 处理连接关闭
    ws.on('close', () => {
        // 清理断开的连接
        for (const [deviceId, client] of clients.entries()) {
            if (client.ws === ws) {
                console.log('设备断开连接:', deviceId);
                clients.delete(deviceId);
                break;
            }
        }
        // 广播更新后的设备列表
        broadcastDeviceList();
    });
});

// 启动 HTTPS 服务器
httpsServer.listen(port, () => {
    console.log(`服务器运行在 https://localhost:${port}`);
    console.log(`WebSocket 服务器运行在 wss://localhost:8080`);
});
