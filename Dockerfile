FROM public.ecr.aws/lambda/nodejs:16

# Install Clamav Engine
RUN yum update -y && yum install -y clamav

# Update local database virus definitions
RUN freshclam

COPY package*.json ./

COPY ./scr/index.js .

RUN npm install

CMD ["index.handler"]
