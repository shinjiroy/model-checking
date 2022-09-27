FROM php:apache-buster

ARG XDEBUG_PORT

# install
RUN set -eux && \
    apt update && \
    apt -y install wkhtmltopdf libpng-dev libjpeg-dev libfreetype6-dev libicu-dev libzip-dev libxml2-dev libonig-dev && \
    pecl install redis xdebug && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
    a2enmod rewrite && \
    docker-php-ext-enable redis && \
    docker-php-ext-install mbstring pdo_mysql gd intl xml zip opcache && \
    apt clean && \
    rm -rf /var/lib/apt/lists/* && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/bin --filename=composer

# setting PHP
# ※opcache.fast_shutdown is deleted at PHP7.2
#   https://www.php.net/manual/ja/opcache.configuration.php#ini.opcache.fast-shutdown
RUN set -eux && \
    cp /usr/local/etc/php/php.ini-development /usr/local/etc/php/php.ini && \
    sed -i \
    -e "/^;*date\.timezone/c date.timezone = Asia/Tokyo" \
    -e "/^;*mbstring\.language/c mbstring.language = Japanese" \
    -e "/^;*auto_detect_line_endings/c auto_detect_line_endings = on" \
    -e "/^;*output_handler/c output_handler = mb_output_handler" \
    -e "/^;*mbstring\.encoding_translation/c mbstring.encoding_translation = on" \
    -e "/^;*mbstring\.detect_order/c mbstring.detect_order = auto" \
    -e "/^;*mbstring\.substitute_character/c mbstring.substitute_character = none" \
    -e "/^;*opcache\.enable\=/c opcache.enable=1" \
    -e "/^;*opcache\.enable_cli\=/c opcache.enable_cli=1" \
    -e "/^;*opcache\.memory_consumption\=/c opcache.memory_consumption=128" \
    -e "/^;*opcache\.interned_strings_buffer\=/c opcache.interned_strings_buffer=8" \
    -e "/^;*opcache\.max_accelerated_files\=/c opcache.max_accelerated_files=4000" \
    -e "/^;*opcache\.revalidate_freq\=/c opcache.revalidate_freq=60" \
    -e "$ a [xdebug]" \
    -e "$ a xdebug.mode=debug" \
    -e "$ a xdebug.client_host=host.docker.internal" \
    -e "$ a xdebug.client_port=${XDEBUG_PORT}" \
    -e "$ a ;xdebug.log=/var/log/php/xdebug.log" \
    -e "$ a xdebug.start_with_request=yes" \
    -e "$ a xdebug.idekey=VSCODE" \
    -e "$ a xdebug.log_level=3" \
    -e "$ a ;zend_extension=$(find /usr/local/lib/php/extensions/ -name xdebug.so)" \
    /usr/local/etc/php/php.ini

# setting apache
COPY ./virtual.conf /etc/apache2/sites-available/000-default.conf
