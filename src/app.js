'use strict';

var d3demo = d3demo || {};

(function d3andRxDemo(d3, Rx) {
  // init
  var width = d3demo.width
    , height = d3demo.height;

  var debugging = true;

  var animationStep = 400;

  var force = null
    , nodes = null
    , dataNodes = null
    , foci = null;

  var svg = d3.select('.map').append('svg')
    .attr('width', width)
    .attr('height', height);

  // A function to initialize our visualization.
  var initForce = function() {
    // clear out the contents of the SVG container
    // makes it possible to restart the layout without refreshing the page
    svg.selectAll('*').remove();

    foci = d3demo.locations.map(function(location) {
      return {x: location.x, y: location.y};
    });

    // define the data
    dataNodes = [];

    //create a force layout object and define its properties
    force = d3.layout.force()
        .size([width, height])
        .nodes(dataNodes)
        .links([])
        .gravity(0)
        .friction(0.83)
        .charge(function(d) {
          return d.present ? -14 : -2;
        });

    nodes = svg.selectAll('.node')
        .data(dataNodes, function(datum, index) {
          datum.id;
        });

    force.on('tick', stepForce);
  };

  var stepForce = function(event) {
    var stepSize = .1;
    var k = stepSize * event.alpha;
     // Push nodes toward their designated focus.
    dataNodes.forEach(function(d, i) {
      d.y += (foci[d.focus].y - d.y) * k;
      d.x += (foci[d.focus].x - d.x) * k;
    });

    var now = new Date().getTime();

    nodes.attr("cx", function(d) { return d.x; })
         .attr("cy", function(d) { return d.y; })
         .attr('r', function(d) { return d.present ? 8 : 3})
         .style('fill', function(d) {
           if (d.present) {
             return getColor(now - d.checkInTimeInternal);
           } else {
             return getColor(d.checkOutTimeInternal - d.checkInTimeInternal);
           }
         });
  };

  var getColor = function(temp) {
    var hue = 270/(temp/1000 + 1);
    var color = 'hsl(' + [Math.floor(hue), '70%', '50%'] + ')'
    return color;
  };

  var findNodeById = function(nodeList, id) {
    var index = -1;
    for (var i = 0; i < dataNodes.length; i++) {
      if (id === dataNodes[i].id) {
        index = i;
        break;
      }
    }
    return index;
  };

  var addNode = function(arrival) {
    var index = findNodeById(dataNodes, arrival.user.id);
    var newNode;
    var add;
    if (index >=0) {
      newNode = dataNodes[index];
      newNode.exiting = false;
      add = false;
      debugging && console.log('Arrival node already present:' + arrival.user.id);
    } else {
      newNode = {id: arrival.user.id};
      add = true;
    }
    newNode.x = d3demo.locations[0].x;
    newNode.y = height;
    newNode.focus = arrival.focus;
    newNode.present = true;
    newNode.user = arrival.user;
    newNode.checkInTime = arrival.time;
    newNode.checkInTimeInternal = new Date().getTime();
    if (add) {
      dataNodes.push(newNode);
    };
  };

  var moveNode = function(movement) {
    var index = findNodeById(dataNodes, movement.user.id);
    if (index >= 0) {
      var dataNode = dataNodes[index];
      dataNode.present = true;
      dataNode.exiting = false;
      dataNode.focus = movement.focus;
      dataNode.checkInTime = movement.time;
      dataNode.checkInTimeInternal = new Date().getTime();
      dataNode.checkOutTime = null;
    } else {
      debugging && console.log('Unable to move node: ' + movement.user.id);
    };
  };

  var removeNode = function(departure) {
    var index = findNodeById(dataNodes, departure.user.id);
    if (index >= 0) {
      var dataNode = dataNodes[index];
      if (dataNode.exiting) {
        debugging && console.log('Node already exiting, ignoring secondary exit call:' + departure.user.id);
        return;
      }
      dataNode.focus = 0;
      dataNode.present = true;
      dataNode.exiting = true;
      setTimeout(function() {
        var currentIndex = findNodeById(dataNodes, dataNode.id);
        var exitNode = dataNodes[currentIndex];
        if (currentIndex >= 0 && exitNode.exiting === true) {
          dataNodes.splice(currentIndex, 1);
          force.start();
          renderNodes();
        } else {
          debugging && console.log('Node no longer available: ' + departure.user.id);
        }
      }, 1200);
    } else {
      debugging && console.log('Unable to remove node: ' + departure.user.id);
    };
  };

  var checkoutNode = function(checkout) {
    var index = findNodeById(dataNodes, checkout.user.id);
    if (index >= 0) {
      dataNodes[index].present = false;
      dataNodes[index].checkOutTime = checkout.time;
      dataNodes[index].checkOutTimeInternal = new Date().getTime();
    } else {
      debugging && console.log('Unable to check-out node: ' + checkout.user.id);
    };
  };

  var renderNodes = function() {
    try {
      nodes = nodes.data(dataNodes, function(datum, index) {
        return datum.id;
      });
    } catch(e) {
      debugging && console.log(e);
    }
    nodes.enter().append("circle")
      .attr("class", 'node' )
      .attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; })
      .attr('r', function(d) { return d.present ? 8 : 2});
    nodes.exit().remove();
  }

  var reset = Rx.Observable.fromEvent(d3.select('#reset').node(), 'click')
    , pause = Rx.Observable.fromEvent(d3.select('#pause').node(), 'click')
    , play = Rx.Observable.fromEvent(d3.select('#play').node(), 'click')
    , slow = Rx.Observable.fromEvent(d3.select('#slow').node(), 'click')
    , nodeClick = Rx.Observable.fromEvent(d3.select('.map').node(), 'click')
    ;

  var pauser = d3demo.pauser;
  var clock = d3demo.clock;
  var source = d3demo.scans;
  var stop = Rx.Observable.merge(reset);

  play.subscribe(function() {
    pauser.onNext(true);
  });

  slow.subscribe(function() {
    pauser.onNext(true);
    clock.take(1).count().subscribe(function(event) {
      setTimeout(function() {
        pauser.onNext(false);
      }, 590);
    });
  })

  pause.subscribe(function() {
    pauser.onNext(false);
  });

  reset.subscribe(function() {
    pauser.onNext(false);
    if (force) {
      force.stop();
    }
    initForce();
    d3demo.resetUsers();
    run();
  });

  var eventTime = d3demo.eventTimeStamp;
  var run = function() {
    // a shared error handler
    var errorHandler = function (err) {
      debugging && console.log(err.stack);
    };

    // logging
    clock.subscribe(function(time) {
      console.log()
      document.getElementById('time').innerHTML = formatTime(time.time);
    });

    var count = 0;
    source.subscribe(function(event) {
      eventTime = event.time;
      document.getElementById('interval').innerHTML = count++;
      document.getElementById('nodeCount').innerHTML = dataNodes.length;
      var message = formatTime(event.time) + ': User '+ event.user.id + ' ' + event.scanner.type + ' at ' + event.scanner.location.name;
      var log = document.getElementById('log');
      var span = document.createElement("span");
      span.className = event.scanner.type;
      span.textContent = message;
      log.appendChild(span);
      log.scrollTop = log.scrollHeight;
    }, errorHandler);

    // arrivals
    source.filter(function(event) {
      return event.user.lastScanner == null && event.scanner.type === 'check-in';
    }).map(function(event) {
      return {
        user: event.user,
        time: event.time,
        focus: event.user.scanner.location.id
      };
    })
    .subscribe(function(arrival) {
      addNode(arrival);
      force.start();
      renderNodes();
    }, errorHandler);

    // movements
    source.filter(function(event) {
      return event.user.lastScanner != null && event.scanner.type === 'check-in';
    }).map(function(event) {
      return {
        user: event.user,
        time: event.time,
        focus: event.user.scanner.location.id
      };
    })
    .subscribe(function(movement) {
      moveNode(movement);
      force.start();
      renderNodes();
    });

    // checkouts
    source.filter(function(event) {
      return event.scanner.type === 'check-out' && event.scanner.location.id !== 0;
    }).map(function(event) {
      return {
        user: event.user,
        time: event.time,
        focus: event.user.scanner.location.id
      };
    })
    .subscribe(function(checkout) {
      checkoutNode(checkout);
      force.start();
      renderNodes();
    }, errorHandler);

    // departures
    source.filter(function(event) {
      return event.scanner.type === 'check-out' && event.scanner.location.id === 0;
    }).map(function(event) {
      return {
        user: event.user,
        time: event.time
      };
    })
    .subscribe(function(departure) {
      removeNode(departure);
      force.start();
      renderNodes();
    }, errorHandler);

    // start the shared (published) interval timer
    pauser.onNext(false);
    clock.connect();
    source.connect();
    pauser.onNext(true);

    force.start();
  };

  nodeClick.filter(function(event) {
    return event.target && event.target.nodeName === 'circle';
  })
  .subscribe(function(event) {
    svg.select('.selected').classed({selected: false});
    var node = d3.select(event.target);
    node.classed({selected: true});
    var data = node.data()[0];
    updateUserInfoPanel(data);
  });

  var updateUserInfoPanel = function(data) {
    var div = d3.select('.userinfo');
    div.style({'display': 'table-cell'});
    debugging && console.log(data);
    div.select('.id_v').text(data.user.id);
    div.select('.name_v').text(data.user.name);
    div.select('.checkin_v').text(formatTime(data.checkInTime));
    div.select('.checkout_v').text(formatTime(data.checkOutTime));
  }

  var formatTime = function(time) {
    if (!time) {
      return "";
    }
    var date = new Date(time);
    var hours = date.getHours();
    var minutes = "0" + date.getMinutes();
    var seconds = "0" + date.getSeconds();

    // will display time in 10:30:23 format
    var formattedTime = hours + ':' + minutes.substr(minutes.length-2) + ':' + seconds.substr(seconds.length-2);
    return formattedTime;
  }

  initForce();
  run();
})(d3, Rx);
