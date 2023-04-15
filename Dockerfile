FROM public.ecr.aws/lambda/nodejs:16

RUN yum update -y && yum install -y clamav

RUN freshclam

COPY package*.json ./

COPY ./scr/index.js .

RUN npm install

CMD ["index.handler"]
