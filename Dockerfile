--- a/Dockerfile
+++ b/Dockerfile
@@
-FROM node:25-alpine AS build
+FROM node:26-alpine AS build
@@
-FROM node:25-alpine AS runtime
+FROM node:26-alpine AS runtime
@@
-RUN npm install -g npm@latest
-RUN apk add --no-cache fontconfig ttf-dejavu
+RUN apk add --no-cache fontconfig ttf-dejavu
