process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';  // 请确保只在开发环境中使用
const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');
const cors = require('cors');

// 读取证书和私钥
const privateKey = fs.readFileSync('/etc/ssl/private/private.key');
const certificate = fs.readFileSync('/usr/local/share/ca-certificates/cert.crt');

const credentials = { key: privateKey, cert: certificate };

const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 创建 HTTPS 服务器
const server = https.createServer(credentials, app);

// WebSocket 服务器（使用 HTTPS 服务器）
const WebSocket = require('ws');
const wsServer = new WebSocket.Server({
    server: server,  // 使用 HTTPS 服务器提供 WebSocket 服务
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
    
    for (const client of clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    }
}

// WebSocket 连接事件
wsServer.on('connection', (ws) => {
    console.log('新客户端连接');
    
    // 处理二进制消息
    function handleBinaryMessage(data) {
        try {
            const headerSize = data.readUInt32LE(0);
            const headerData = data.slice(4, 4 + headerSize);
            const header = JSON.parse(headerData.toString());

            const targetClient = clients.get(header.to);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
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
                broadcastDeviceList();
                break;

            case 'message':
                // 转发消息到目标设备
                console.log('转发消息:', message);
                const targetClient = clients.get(message.to);
                if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
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
            if (typeof data === 'string') {
                const message = JSON.parse(data);
                handleTextMessage(message);
                return;
            }

            handleBinaryMessage(data);
        } catch (error) {
            console.error('处理消息时出错:', error);
        }
    });

    // 关闭连接时清理
    ws.on('close', () => {
        for (const [deviceId, client] of clients.entries()) {
            if (client.ws === ws) {
                console.log('设备断开连接:', deviceId);
                clients.delete(deviceId);
                break;
            }
        }
        broadcastDeviceList();
    });
});

// 启动 HTTPS 和 WebSocket 服务器
server.listen(port, () => {
    console.log(`HTTPS 服务器运行在 https://localhost:${port}`);
    console.log(`WebSocket 服务器运行在 wss://localhost:8080`);
});
