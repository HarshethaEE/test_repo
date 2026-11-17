# Keep this tag in sync with @playwright/test in package.json.
FROM mcr.microsoft.com/playwright:v1.65.0-jammy

WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci

# Source is bind-mounted at /work at run time (see README).
CMD ["npm", "run", "test:visual"]
