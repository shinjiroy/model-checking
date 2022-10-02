FROM mysql:8.0-debian

ARG MYSQL_DATABASE
ARG MYSQL_USER

RUN apt update && \
    apt install tzdata && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

# make SQL file to creat testDB
RUN echo "CREATE DATABASE IF NOT EXISTS \`test_${MYSQL_DATABASE}\` COLLATE 'utf8_general_ci' ; GRANT ALL ON \`phpunit_${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%' ;" > /docker-entrypoint-initdb.d/createTestDb.sql

COPY ./my.cnf /etc/mysql/conf.d/my.cnf
RUN chmod 644 /etc/mysql/conf.d/my.cnf
