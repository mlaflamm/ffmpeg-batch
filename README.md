# ffmpeg-batch
A tool that watch a directory for new video files to scale down. I built this for myself. 

#### Docker cheatsheet

##### build docker image
```
docker build -t mlaflamme/ffmpeg-batch .
```

##### publish docker image
```
docker push mlaflamme/ffmpeg-batch
```

##### run interactive shell in running container
```
docker exec -it <container> /bin/bash
```
