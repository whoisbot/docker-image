# 使用官方的 Node.js 22.12.0 镜像作为基础镜像
FROM node:16-alpine

# 创建并设置工作目录
WORKDIR /usr/src/app

# 复制 package.json 和 package-lock.json 到容器中的工作目录
COPY package*.json ./

# 安装项目依赖
RUN npm install

# 复制整个项目到容器中
COPY . .

# 暴露容器内的端口（假设应用在 3000 端口运行）
EXPOSE 3000

# 设置容器启动时的默认命令
CMD ["npm", "start"]
