FROM php:8.3-apache

# Install PDO MySQL extensions required for Saddah ERP
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Enable Apache mod_rewrite for Saddah ERP clean routing (.htaccess)
RUN a2enmod rewrite

# Configure Live Display Errors for debugging
RUN echo "display_errors = On" >> /usr/local/etc/php/conf.d/docker-php-errors.ini \
 && echo "display_startup_errors = On" >> /usr/local/etc/php/conf.d/docker-php-errors.ini \
 && echo "error_reporting = E_ALL" >> /usr/local/etc/php/conf.d/docker-php-errors.ini

WORKDIR /var/www/html
