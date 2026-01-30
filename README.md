# Mankai Server

Mankai Server is a sample implementation of [Mankai API Specification](api.md) with user and manga management features.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

### Running with Docker Compose

> **Important:**
>
> For security, edit the `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` values in your `docker-compose.yml` file before deploying or running in production.

1. Build and start all services:

   ```
   sudo docker-compose up -d
   ```

2. Once started, the admin page will be available at [http://localhost:3000](http://localhost:3000), and the backend API at [http://localhost:3000/api](http://localhost:3000/api).

3. To stop the services:
   ```
   sudo docker-compose down
   ```

## Security

For enhanced security, it is recommended to use a reverse proxy (such as Nginx) to handle incoming traffic. Configure the proxy to only forward requests destined for `/api`, ensuring that the admin interface and admin API remain inaccessible from the public internet.
