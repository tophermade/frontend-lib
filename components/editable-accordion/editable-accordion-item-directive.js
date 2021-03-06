angular.module( 'gj.EditableAccordion' ).directive( 'gjEditableAccordionItem', function()
{
	return {
		restrict: 'E',
		require: [ '^gjEditableAccordion', 'gjEditableAccordionItem' ],
		scope: {
			toggledHandler: '&?itemToggled',
			itemId: '@?itemId',
		},
		controller: function( $scope, $attrs )
		{
			this.id = undefined;

			// We decide whether or not this is expandable by if it has a body element or not.
			this.notExpandable = true;

			// We only show the drag handle if this is a ui-tree-node.
			this.shouldShowHandle = angular.isDefined( $attrs.uiTreeNode );

			this.toggleVisible = function()
			{
				// If not expandable, do nothing.
				if ( this.notExpandable ) {
					return;
				}

				var state;
				if ( $scope.accordion.activeItem != this.id ) {
					$scope.accordion.setActiveItem( this.id );
					state = true;
				}
				else {
					$scope.accordion.setActiveItem( null );
					state = false;
				}

				// If we have a handler, call it.
				if ( $scope.toggledHandler ) {
					$scope.toggledHandler( { state: state } );
				}
			};
		},
		compile: function( element )
		{
			element.addClass( 'editable-accordion-item-container' );

			return function( scope, element, attrs, ctrls )
			{
				var accordion = ctrls[0];
				var item = ctrls[1];

				scope.accordion = accordion;
				scope.item = item;

				if ( scope.itemId ) {
					item.id = scope.itemId;
					accordion.registerItem( item.id );
				}
				else {
					item.id = accordion.registerItem();
				}

				scope.$on( '$destroy', function()
				{
					accordion.deregisterItem( item.id );
				} );
			};
		}
	};
} );
