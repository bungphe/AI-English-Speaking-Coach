#!/bin/sh

# Create config.js with API keys from environment variable
echo "window.API_KEYS = [$(echo $API_KEYS | sed 's/,/","/g' | sed 's/^/"/' | sed 's/$/"/')];" > /usr/share/nginx/html/config.js

# Start Nginx
exec "$@"
