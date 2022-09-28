FROM httpd:2.4-buster

ARG NODEJS_VERSION

RUN useradd -m -d /home/dev -s /bin/bash dev

# install
RUN set -eux && \
    apt update && \
    apt -y install curl gnupg && \
    curl -sSL https://deb.nodesource.com/setup_${NODEJS_VERSION}.x | bash - && \
    apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 1655A0AB68576280 && \
    apt -y install nkf nodejs && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*

# setting apache
COPY ./virtual.conf /etc/apache2/sites-available/000-default.conf
