FROM node:24-alpine

WORKDIR /app

# 生成物(apps/web/dist)をホストと共有するため、コンテナ側もホストと同じuid:gid(1000)で走らせる。
# nodeイメージ既定のnodeユーザーがuid 1000にあたる。rootのまま走らせるとdist/がroot所有になり、
# ホスト側のvite buildがdist/を消せずEACCESで落ちる
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node packages/spec/package.json ./packages/spec/package.json
COPY --chown=node:node apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY --chown=node:node . .

CMD ["npm", "test"]
