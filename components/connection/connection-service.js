angular.module( 'gj.Connection' ).service( 'Connection', function( $rootScope, $window, $document, $injector, $state, Environment, Connection_Reconnect )
{
	var _this = this;

	var reconnectChecker = null;

	// This attribute isn't perfect.
	// The browser will set this when they are absolutely disconnected to the internet through their
	// network card, but it won't catch things like their router saying they're connected even though
	// it has no connection.
	// We have to do our own request checking for that.
	this.isDeviceOffline = !$window.navigator.onLine;
	this.hasRequestFailure = false;
	this.isOnline = !this.isDeviceOffline && !this.hasRequestFailure;

	// Convenience var to make it easier to hide things offline just in client.
	this.isClientOffline = Environment.isClient && !this.isOnline;

	// For easier testing.
	if ( Environment.buildType == 'development' && $injector.has( 'hotkeys' ) ) {
		$injector.get( 'hotkeys' ).add( {
			combo: 'o',
			description: 'Toggle offline mode.',
			callback: function()
			{
				_this.isDeviceOffline = !_this.isDeviceOffline;
				refreshIsOnline();
			}
		} );
	}

	/**
	 * Can be used to tell us that a request has failed due to a connection error
	 * or when a request has went through successfully so we can reset.
	 */
	this.setRequestFailure = function( failed )
	{
		// Do nothing if we're not switch states.
		if ( this.hasRequestFailure == failed ) {
			return;
		}

		// If we went into request failure mode let's start checking for a reconnection.
		if ( failed ) {
			setupReconnectChecker();
		}

		// If we got a successful request, go back into a good request state right away.
		if ( !failed && reconnectChecker ) {
			reconnectChecker.finish();
		}
	};

	function setupReconnectChecker()
	{
		// We don't want to set that we have a request failure until we do a first check that fails.
		// When we come back online, we just want to set that we no longer have a request failure.
		reconnectChecker = new Connection_Reconnect(
			function()
			{
				// If we were marked as no request failure, let's put us in that mode.
				if ( !_this.hasRequestFailure ) {
					_this.hasRequestFailure = true;
					refreshIsOnline();
				}
			},
			function()
			{
				// We are connected back to the server.
				// Let's set that we're good to go.
				reconnectChecker = null;

				// Only toggle back to no failure if we were set as having a failure.
				// This ensures we don't reload the page if we don't have to.
				if ( _this.hasRequestFailure ) {
					_this.hasRequestFailure = false;
					refreshIsOnline();

					// We have to reload the current state.
					// This way they get the new view of information again.
					// This COULD cause issues with things changing on the page, but I'm not sure of a better way...
					$state.reload();
				}
			}
		);
	}

	$rootScope.$on( 'Payload.responseError', function( event, response )
	{
		// Usually offline, timed out, or aborted request.
		// Set that a request has failed.
		if ( response.status == -1 ) {
			_this.setRequestFailure( true );
		}
	} );

	$rootScope.$on( 'Payload.responseSuccess', function()
	{
		// Clear out our request errors when a successful response comes through.
		_this.setRequestFailure( false );
	} );

	/**
	 * We hook into browser events to know right away if they lost connection to their router.
	 */
	$document.on( 'online', function()
	{
		_this.isDeviceOffline = false;
		refreshIsOnline();

		// While connection was offline, we may have tried making a request that failed.
		// Let's recheck for connectivity right away if that is the case.
		if ( reconnectChecker ) {
			reconnectChecker.check();
		}
	} );

	$document.on( 'offline', function()
	{
		_this.isDeviceOffline = true;
		refreshIsOnline();
	} );

	/**
	 * Does all the required checks to see if the connection is down.
	 * This way we can access it through one simple variable, even though we store
	 * different statuses for different types of connection errors.
	 */
	function refreshIsOnline()
	{
		if ( _this.hasRequestFailure || _this.isDeviceOffline ) {
			_this.isOnline = false;
		}
		else {
			_this.isOnline = true;
		}

		_this.isClientOffline = Environment.isClient && !_this.isOnline;
	}
} );
