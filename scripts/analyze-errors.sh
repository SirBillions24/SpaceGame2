#!/bin/bash
# Error Log Analysis Script
# Analyzes the dedicated error log for patterns and recent issues

LOG_FILE="/home/bone/oldschoolempire/logs/errors.log"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}=== Dread Horizon Error Analysis ===${NC}"
echo ""

# Check if log file exists
if [ ! -f "$LOG_FILE" ]; then
    echo -e "${GREEN}✅ No error log file found - this is good!${NC}"
    echo "   Log file will be created at: $LOG_FILE"
    exit 0
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq is required but not installed.${NC}"
    echo "   Install with: sudo apt install jq"
    exit 1
fi

TOTAL_ERRORS=$(wc -l < "$LOG_FILE")
echo -e "${YELLOW}Total errors logged: $TOTAL_ERRORS${NC}"
echo ""

# Get today's date
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d 'yesterday' +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)

echo -e "${CYAN}=== Errors by Category (All Time) ===${NC}"
cat "$LOG_FILE" | jq -r '.category' | sort | uniq -c | sort -rn | while read count category; do
    case "$category" in
        REDIS_READONLY|REDIS_CONNECTION)
            echo -e "  ${RED}$count${NC} $category"
            ;;
        UNCAUGHT_EXCEPTION|UNHANDLED_REJECTION)
            echo -e "  ${YELLOW}$count${NC} $category"
            ;;
        *)
            echo "  $count $category"
            ;;
    esac
done
echo ""

echo -e "${CYAN}=== Today's Errors ($TODAY) ===${NC}"
TODAY_COUNT=$(grep "$TODAY" "$LOG_FILE" 2>/dev/null | wc -l)
if [ "$TODAY_COUNT" -gt 0 ]; then
    echo -e "${RED}$TODAY_COUNT errors today${NC}"
    grep "$TODAY" "$LOG_FILE" | jq -r '.category' | sort | uniq -c | sort -rn
else
    echo -e "${GREEN}✅ No errors today${NC}"
fi
echo ""

echo -e "${CYAN}=== Recent Errors (Last 10) ===${NC}"
tail -10 "$LOG_FILE" | jq -r '[.timestamp, .category, .message] | join(" | ")' 2>/dev/null || echo "No errors found"
echo ""

echo -e "${CYAN}=== Redis Issues (if any) ===${NC}"
REDIS_ERRORS=$(grep -E "REDIS_" "$LOG_FILE" 2>/dev/null | wc -l)
if [ "$REDIS_ERRORS" -gt 0 ]; then
    echo -e "${RED}$REDIS_ERRORS Redis-related errors found${NC}"
    echo ""
    echo "Most recent Redis errors:"
    grep -E "REDIS_" "$LOG_FILE" | tail -5 | jq -r '[.timestamp, .category, .message] | join(" | ")'
else
    echo -e "${GREEN}✅ No Redis errors logged${NC}"
fi
echo ""

echo -e "${CYAN}=== Hourly Distribution (Last 24 Hours) ===${NC}"
for hour in $(seq 0 23); do
    HOUR_PADDED=$(printf "%02d" $hour)
    COUNT=$(grep -E "${TODAY}T${HOUR_PADDED}:|${YESTERDAY}T${HOUR_PADDED}:" "$LOG_FILE" 2>/dev/null | wc -l)
    if [ "$COUNT" -gt 0 ]; then
        BAR=$(printf '█%.0s' $(seq 1 $((COUNT > 50 ? 50 : COUNT))))
        echo -e "  ${HOUR_PADDED}:00  ${BAR} ${COUNT}"
    fi
done
echo ""

echo -e "${CYAN}=== Recommendations ===${NC}"
if grep -q "REDIS_READONLY" "$LOG_FILE" 2>/dev/null; then
    echo -e "${RED}⚠️  Redis read-only errors detected!${NC}"
    echo "   Run: ./fix-redis.sh to reset Redis"
fi

if grep -q "UNCAUGHT_EXCEPTION" "$LOG_FILE" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Uncaught exceptions detected - review recent deployments${NC}"
fi

if [ "$TODAY_COUNT" -eq 0 ] && [ "$TOTAL_ERRORS" -lt 10 ]; then
    echo -e "${GREEN}✅ System appears healthy${NC}"
fi

echo ""
echo "Log file location: $LOG_FILE"

