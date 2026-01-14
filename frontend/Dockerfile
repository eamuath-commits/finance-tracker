# Build Stage
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expose port and start dev server (for simplicity in Phase 2)
# In production, we would build and serve with Nginx
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
