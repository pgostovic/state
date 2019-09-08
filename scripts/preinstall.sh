
#!/bin/sh
if [ "$NO_LINK" != "1" ]; then
  mkdir -p node_modules.nosync; ln -sfn node_modules.nosync node_modules
fi
