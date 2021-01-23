fuser -k 3000/tcp
export AWS_PROFILE=testuser
export GOOGLE_APPLICATION_CREDENTIALS="./exchange-key.json"
forever -c "nodemon --exitcrash" bin/www
