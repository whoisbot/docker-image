# 使用 ARM64 支持的 Node.js 镜像作为基础镜像
FROM node:16-alpine

# 设置工作目录
WORKDIR /usr/src/app

# 将当前目录的所有文件复制到容器中的工作目录
COPY . .

# 安装依赖
RUN npm install

# 暴露项目运行的端口 (假设项目在 3000 端口运行)
EXPOSE 3000

# 设置容器启动时执行的命令
CMD ["npm", "start"]
