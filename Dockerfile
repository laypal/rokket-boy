# HRD.5: base images pinned by digest — a floating tag is a supply-chain
# door on the prod host. Bump deliberately: docker pull <tag>, copy the new
# digest here, rebuild, re-verify.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: 172 dev-dep lifecycle scripts never execute on the prod
# host; the toolchain's native binaries (rolldown, oxc) arrive as platform
# optionalDependencies, not postinstall downloads, so the build still works
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
# HRD.4: nginx header snippet with the inline-script CSP hash baked in —
# must run after the build so the hash matches the artifact being served
RUN node scripts/gen-headers-conf.mjs dist/team-rokket.html > /app/security-headers.conf

FROM nginx:stable-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46
COPY --from=build /app/dist/team-rokket.html /usr/share/nginx/html/index.html
COPY --from=build /app/security-headers.conf /etc/nginx/conf.d/security-headers.conf
