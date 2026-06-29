refresh-redis:
	@echo "Refreshing Redis cache..."
	@if docker exec -it auth-redis redis-cli -a cav3nghFL8hRB309Jg7Zxqox9r0GOsQc4fkiZU2u76w FLUSHALL > /dev/null 2>&1; then \
		echo "Redis cache refreshed."; \
	else \
		echo "Failed to refresh Redis cache. Please check if the Redis container is running and the password is correct."; \
		exit 1; \
	fi
