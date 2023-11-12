podman-compose up
podman exec -i primesynth_service psql primesynth -U postgres < ./app/db/schema.pgsql