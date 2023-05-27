FROM php:apache-buster

ARG DEV_USER_UID
ARG DEV_USER_GID

RUN groupadd -g ${DEV_USER_GID} docker && \
    useradd -u ${DEV_USER_UID} -g docker -G www-data -m -d /home/dev -s /bin/bash dev

# install
RUN set -eux && \
    apt update && \
    apt -y install libpng-dev libjpeg-dev libfreetype6-dev libicu-dev libzip-dev libxml2-dev libonig-dev && \
    pecl install redis xdebug && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
    a2enmod rewrite && \
    docker-php-ext-enable redis && \
    docker-php-ext-install mbstring pdo_mysql gd intl xml zip opcache && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/bin --filename=composer

# setting apache
COPY ./virtual.conf /etc/apache2/sites-available/000-default.conf
