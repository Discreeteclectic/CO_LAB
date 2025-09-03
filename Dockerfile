# CO-LAB CRM Production Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S colab -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application files
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY TECHNICAL_DOCS.md ./
COPY .env.example ./

# Create logs directory
RUN mkdir -p logs && \
    chown -R colab:nodejs /app

# Set security headers and limits
ENV NODE_ENV=production
ENV PORT=8080
ENV LOG_LEVEL=info

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Switch to non-root user
USER colab

# Start application
CMD ["node", "backend/production-server.js"]