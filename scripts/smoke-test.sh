#!/bin/bash
BASE_URL=${1:-http://localhost:3000/api/v1}
endpoints=("/health" "/auth/student/register" "/courses" "/faq" "/notification")
for ep in "${endpoints[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ep")
  echo "$ep → $status"
done
