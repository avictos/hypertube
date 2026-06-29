all: spin-db seed-db

spin-db:
	cd ..
	docker compose up -d
	cd -
	npx drizzle-kit generate
	npx drizzle-kit push

seed-db:
	python3 downloader.py
	mkdir -p ./drizzle/data
	mv movies.csv ./drizzle/data/movies.csv
	npm run seed
	npm run migrate-poster-origin
